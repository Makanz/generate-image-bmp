using System.Text;
using GenerateImageBmp;
using Xunit;

namespace GenerateImageBmp.Tests;

public sealed class Bmp1WriterTests
{
    [Fact]
    public void WritesExpectedHeaderAndSize_For800x480()
    {
        const int width = 800;
        const int height = 480;

        var stride = (width + 7) / 8;
        var mono = new MonochromeBitmap(width, height, new byte[stride * height], stride);

        using var ms = new MemoryStream();
        Bmp1Writer.Write(ms, mono);
        var bytes = ms.ToArray();

        // RowBytes = ((800+31)/32)*4 = 100; image size 100*480 = 48000; headers+palette=62
        Assert.Equal(48062, bytes.Length);

        Assert.Equal("BM", Encoding.ASCII.GetString(bytes, 0, 2));
        Assert.Equal(48062, BitConverter.ToInt32(bytes, 2));
        Assert.Equal(62, BitConverter.ToInt32(bytes, 10));

        Assert.Equal(40, BitConverter.ToInt32(bytes, 14));
        Assert.Equal(width, BitConverter.ToInt32(bytes, 18));
        Assert.Equal(height, BitConverter.ToInt32(bytes, 22));
        Assert.Equal((short)1, BitConverter.ToInt16(bytes, 26));
        Assert.Equal((short)1, BitConverter.ToInt16(bytes, 28));
    }

    [Fact]
    public void WritesRowsBottomUp()
    {
        const int width = 8;
        const int height = 2;
        const int stride = 1;

        // Top row (y=0): all black; bottom row (y=1): all white.
        var data = new byte[stride * height];
        data[0] = 0xFF;
        data[1] = 0x00;
        var mono = new MonochromeBitmap(width, height, data, stride);

        using var ms = new MemoryStream();
        Bmp1Writer.Write(ms, mono);
        var bytes = ms.ToArray();

        const int pixelOffset = 62;
        const int rowBytes = 4;

        // First written row is bottom row.
        Assert.Equal(0x00, bytes[pixelOffset + 0]);
        Assert.Equal(0x00, bytes[pixelOffset + 1]);
        Assert.Equal(0x00, bytes[pixelOffset + 2]);
        Assert.Equal(0x00, bytes[pixelOffset + 3]);

        // Second written row is top row.
        Assert.Equal(0xFF, bytes[pixelOffset + rowBytes + 0]);
        Assert.Equal(0x00, bytes[pixelOffset + rowBytes + 1]);
        Assert.Equal(0x00, bytes[pixelOffset + rowBytes + 2]);
        Assert.Equal(0x00, bytes[pixelOffset + rowBytes + 3]);
    }
}
