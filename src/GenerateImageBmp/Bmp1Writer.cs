using System.Buffers.Binary;

namespace GenerateImageBmp;

internal static class Bmp1Writer
{
    public static void WriteFile(string path, MonochromeBitmap bitmap)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        using var fs = File.Create(path);
        Write(fs, bitmap);
    }

    public static void Write(Stream stream, MonochromeBitmap bitmap)
    {
        if (!stream.CanWrite) throw new ArgumentException("Stream must be writable.", nameof(stream));

        var width = bitmap.Width;
        var height = bitmap.Height;
        var rowBytes = checked(((width + 31) / 32) * 4); // 4-byte aligned row for 1bpp
        var imageSize = checked(rowBytes * height);
        const int fileHeaderSize = 14;
        const int infoHeaderSize = 40;
        const int paletteSize = 8;
        const int pixelDataOffset = fileHeaderSize + infoHeaderSize + paletteSize;
        var fileSize = checked(pixelDataOffset + imageSize);

        Span<byte> fileHeader = stackalloc byte[fileHeaderSize];
        fileHeader[0] = (byte)'B';
        fileHeader[1] = (byte)'M';
        BinaryPrimitives.WriteInt32LittleEndian(fileHeader.Slice(2, 4), fileSize);
        BinaryPrimitives.WriteInt32LittleEndian(fileHeader.Slice(10, 4), pixelDataOffset);
        stream.Write(fileHeader);

        Span<byte> infoHeader = stackalloc byte[infoHeaderSize];
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(0, 4), infoHeaderSize);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(4, 4), width);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(8, 4), height); // bottom-up
        BinaryPrimitives.WriteInt16LittleEndian(infoHeader.Slice(12, 2), 1); // planes
        BinaryPrimitives.WriteInt16LittleEndian(infoHeader.Slice(14, 2), 1); // bpp
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(20, 4), imageSize);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(24, 4), 2835); // 72 DPI
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(28, 4), 2835);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(32, 4), 2); // colors used
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(36, 4), 2);
        stream.Write(infoHeader);

        // Palette: index 0 = white, index 1 = black (BGRA)
        Span<byte> palette = stackalloc byte[paletteSize];
        palette[0] = 255; // B
        palette[1] = 255; // G
        palette[2] = 255; // R
        palette[3] = 0;
        palette[4] = 0;
        palette[5] = 0;
        palette[6] = 0;
        palette[7] = 0;
        stream.Write(palette);

        var srcStride = bitmap.StrideBytes;
        if (srcStride > rowBytes)
        {
            throw new ArgumentException("Bitmap stride exceeds BMP row size.", nameof(bitmap));
        }

        var row = new byte[rowBytes];
        for (var y = height - 1; y >= 0; y--)
        {
            Array.Clear(row);
            Buffer.BlockCopy(bitmap.Data, y * srcStride, row, 0, srcStride);
            stream.Write(row);
        }
    }
}
