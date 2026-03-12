using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Runtime.InteropServices;

namespace GenerateImageBmp;

internal static class TextToMonochromeRenderer
{
    public static MonochromeBitmap Render(AppOptions options)
    {
        using var bmp = new Bitmap(options.Width, options.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);

        g.Clear(Color.White);
        g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;
        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

        using var font = new Font(options.FontFamily, options.FontSizePx, FontStyle.Regular, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(Color.Black);
        using var format = new StringFormat(StringFormatFlags.LineLimit);
        format.Alignment = StringAlignment.Center;
        format.LineAlignment = StringAlignment.Center;
        format.Trimming = StringTrimming.EllipsisWord;

        var margin = Math.Max(0, options.MarginPx);
        var rect = new RectangleF(margin, margin, Math.Max(1, options.Width - margin * 2), Math.Max(1, options.Height - margin * 2));
        g.DrawString(options.Text, font, brush, rect, format);

        var stride = (options.Width + 7) / 8;
        var data = new byte[stride * options.Height];

        var bits = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            var byteCount = checked(bits.Stride * bits.Height);
            var raw = new byte[byteCount];
            Marshal.Copy(bits.Scan0, raw, 0, raw.Length);

            if (options.Dither)
            {
                DitherFloydSteinberg(options.Width, options.Height, raw, bits.Stride, options.Threshold, data, stride);
            }
            else
            {
                Threshold(options.Width, options.Height, raw, bits.Stride, options.Threshold, data, stride);
            }
        }
        finally
        {
            bmp.UnlockBits(bits);
        }

        return new MonochromeBitmap(options.Width, options.Height, data, stride);
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
                var g = argb[i + 1];
                var r = argb[i + 2];

                var lum = (0.2126f * r) + (0.7152f * g) + (0.0722f * b);
                var isBlack = lum < threshold;

                if (isBlack)
                {
                    dstBits[dstRow + (x >> 3)] |= (byte)(0x80 >> (x & 7));
                }
            }
        }
    }

    private static void DitherFloydSteinberg(int width, int height, byte[] argb, int srcStride, byte threshold, byte[] dstBits, int dstStride)
    {
        var lum = new float[checked(width * height)];

        for (var y = 0; y < height; y++)
        {
            var srcRow = y * srcStride;
            for (var x = 0; x < width; x++)
            {
                var i = srcRow + x * 4;
                var b = argb[i + 0];
                var g = argb[i + 1];
                var r = argb[i + 2];
                lum[y * width + x] = (0.2126f * r) + (0.7152f * g) + (0.0722f * b);
            }
        }

        for (var y = 0; y < height; y++)
        {
            var dstRow = y * dstStride;
            for (var x = 0; x < width; x++)
            {
                var idx = y * width + x;
                var oldLum = lum[idx];
                var newLum = oldLum < threshold ? 0f : 255f;
                var err = oldLum - newLum;

                if (newLum == 0f)
                {
                    dstBits[dstRow + (x >> 3)] |= (byte)(0x80 >> (x & 7));
                }

                if (x + 1 < width) lum[idx + 1] += err * (7f / 16f);
                if (y + 1 < height)
                {
                    if (x > 0) lum[idx + width - 1] += err * (3f / 16f);
                    lum[idx + width] += err * (5f / 16f);
                    if (x + 1 < width) lum[idx + width + 1] += err * (1f / 16f);
                }
            }
        }
    }
}
