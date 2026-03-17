namespace GenerateImageBmp;

internal sealed class GrayscaleBitmap
{
    public int Width { get; }
    public int Height { get; }

    // 4-bit grayscale, 2 pixels per byte. Row-major, 4-byte aligned.
    public byte[] Data { get; }
    public int StrideBytes { get; }

    public GrayscaleBitmap(int width, int height, byte[] data, int strideBytes)
    {
        if (width <= 0) throw new ArgumentOutOfRangeException(nameof(width));
        if (height <= 0) throw new ArgumentOutOfRangeException(nameof(height));
        if (strideBytes <= 0) throw new ArgumentOutOfRangeException(nameof(strideBytes));
        if (data.Length != checked(strideBytes * height)) throw new ArgumentException("Invalid data length.", nameof(data));

        Width = width;
        Height = height;
        Data = data;
        StrideBytes = strideBytes;
    }

    public void SetPixel(int x, int y, byte gray)
    {
        if ((uint)x >= (uint)Width) throw new ArgumentOutOfRangeException(nameof(x));
        if ((uint)y >= (uint)Height) throw new ArgumentOutOfRangeException(nameof(y));
        if (gray > 15) gray = 15;

        var index = y * StrideBytes + (x >> 1);
        var nibble = (x & 1) == 0 ? 4 : 0;
        Data[index] = (byte)((Data[index] & (0xF0 >> nibble)) | (gray << nibble));
    }

    public byte GetPixel(int x, int y)
    {
        if ((uint)x >= (uint)Width) throw new ArgumentOutOfRangeException(nameof(x));
        if ((uint)y >= (uint)Height) throw new ArgumentOutOfRangeException(nameof(y));

        var index = y * StrideBytes + (x >> 1);
        return (byte)((Data[index] >> ((x & 1) * 4)) & 0x0F);
    }
}
