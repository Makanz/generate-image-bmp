using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using GenerateImageBmp.Components;

namespace GenerateImageBmp;

public sealed class DashboardCanvas
{
    public int Width { get; }
    public int Height { get; }
    public List<DashboardComponent> Components { get; } = new();

    public DashboardCanvas(int width, int height)
    {
        Width = width;
        Height = height;
    }

    public void RenderToFile(string outputPath, byte threshold = 200)
    {
        RenderToFile(outputPath, threshold, useGrayscale: false);
    }

    public void RenderToFile(string outputPath, byte threshold, bool useGrayscale)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);

        using var bmp = new Bitmap(Width, Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);

        g.Clear(Color.White);
        g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

        foreach (var component in Components)
        {
            component.Render(g);
        }

        if (useGrayscale)
        {
            var stride = ((Width + 1) / 2);
            stride = ((stride + 3) / 4) * 4;
            var data = new byte[stride * Height];

            var bits = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                var byteCount = checked(bits.Stride * bits.Height);
                var raw = new byte[byteCount];
                Marshal.Copy(bits.Scan0, raw, 0, raw.Length);

                ToGrayscale(Width, Height, raw, bits.Stride, data, stride);
            }
            finally
            {
                bmp.UnlockBits(bits);
            }

            var grayBmp = new GrayscaleBitmap(Width, Height, data, stride);
            Bmp4Writer.WriteFile(outputPath, grayBmp);
        }
        else
        {
            var stride = (Width + 7) / 8;
            var data = new byte[stride * Height];

            var bits = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                var byteCount = checked(bits.Stride * bits.Height);
                var raw = new byte[byteCount];
                Marshal.Copy(bits.Scan0, raw, 0, raw.Length);

                Threshold(Width, Height, raw, bits.Stride, threshold, data, stride);
            }
            finally
            {
                bmp.UnlockBits(bits);
            }

            var mono = new MonochromeBitmap(Width, Height, data, stride);
            Bmp1Writer.WriteFile(outputPath, mono);
        }
    }

    private static void Threshold(int width, int height, byte[] argb, int srcStride, byte threshold, byte[] dstBits, int dstStride)
    {
        for (var y = 0; y < height; y++)
        {
            var srcRow = y * srcStride;
            var dstRow = y * dstStride;

            for (var x = 0; x < width; x++)
            {
                var i = srcRow + x * 4;
                var b = argb[i + 0];
                var gv = argb[i + 1];
                var r = argb[i + 2];

                var lum = (0.2126f * r) + (0.7152f * gv) + (0.0722f * b);
                var isBlack = lum < threshold;

                if (isBlack)
                {
                    dstBits[dstRow + (x >> 3)] |= (byte)(0x80 >> (x & 7));
                }
            }
        }
    }

    private static void ToGrayscale(int width, int height, byte[] argb, int srcStride, byte[] dstBits, int dstStride)
    {
        Array.Clear(dstBits, 0, dstBits.Length);

        for (var y = 0; y < height; y++)
        {
            var srcRow = y * srcStride;
            var dstRow = y * dstStride;

            for (var x = 0; x < width; x++)
            {
                var i = srcRow + x * 4;
                var b = argb[i + 0];
                var gv = argb[i + 1];
                var r = argb[i + 2];

                var lum = (byte)((r * 77 + gv * 151 + b * 28) >> 8);
                var nibble = (byte)((lum + 8) / 16);

                var idx = dstRow + (x >> 1);
                if ((x & 1) == 0)
                {
                    dstBits[idx] = (byte)((dstBits[idx] & 0x0F) | (nibble << 4));
                }
                else
                {
                    dstBits[idx] = (byte)((dstBits[idx] & 0xF0) | nibble);
                }
            }
        }
    }
}
