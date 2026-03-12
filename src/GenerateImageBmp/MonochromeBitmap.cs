namespace GenerateImageBmp;

internal sealed class MonochromeBitmap
{
    public int Width { get; }
    public int Height { get; }

    // Packed bits, row-major, top-down. MSB is leftmost pixel within each byte.
    public byte[] Data { get; }
    public int StrideBytes { get; }

    public MonochromeBitmap(int width, int height, byte[] data, int strideBytes)
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

    public bool GetPixelIsBlack(int x, int y)
    {
        if ((uint)x >= (uint)Width) throw new ArgumentOutOfRangeException(nameof(x));
        if ((uint)y >= (uint)Height) throw new ArgumentOutOfRangeException(nameof(y));

        var index = checked(y * StrideBytes + (x >> 3));
        var mask = (byte)(0x80 >> (x & 7));
        return (Data[index] & mask) != 0;
    }
}
