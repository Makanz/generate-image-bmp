using System.Buffers.Binary;

namespace GenerateImageBmp;

internal static class Bmp4Writer
{
    public static void WriteFile(string path, GrayscaleBitmap bitmap)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        using var fs = File.Create(path);
        Write(fs, bitmap);
    }

    public static void Write(Stream stream, GrayscaleBitmap bitmap)
    {
        if (!stream.CanWrite) throw new ArgumentException("Stream must be writable.", nameof(stream));

        var width = bitmap.Width;
        var height = bitmap.Height;
        var rowBytes = checked(((width + 3) / 4) * 4);
        var imageSize = checked(rowBytes * height);
        const int fileHeaderSize = 14;
        const int infoHeaderSize = 40;
        const int paletteSize = 16 * 4;
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
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(8, 4), height);
        BinaryPrimitives.WriteInt16LittleEndian(infoHeader.Slice(12, 2), 1);
        BinaryPrimitives.WriteInt16LittleEndian(infoHeader.Slice(14, 2), 4);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(20, 4), imageSize);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(24, 4), 2835);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(28, 4), 2835);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(32, 4), 16);
        BinaryPrimitives.WriteInt32LittleEndian(infoHeader.Slice(36, 4), 0);
        stream.Write(infoHeader);

        Span<byte> palette = stackalloc byte[paletteSize];
        for (var i = 0; i < 16; i++)
        {
            var gray = (byte)(i * 255 / 15);
            palette[i * 4 + 0] = gray;
            palette[i * 4 + 1] = gray;
            palette[i * 4 + 2] = gray;
            palette[i * 4 + 3] = 0;
        }
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
