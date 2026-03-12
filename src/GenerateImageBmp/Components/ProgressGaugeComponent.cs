using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace GenerateImageBmp.Components;

public sealed class ProgressGaugeComponent : DashboardComponent
{
    public int Percentage { get; }
    public string Label { get; init; } = "";

    public ProgressGaugeComponent(int percentage, string label, Point position, Size? size = null)
    {
        Percentage = Math.Clamp(percentage, 0, 100);
        Label = label;
        Position = position;
        Size = size ?? new Size(140, 160);
    }

    public override void Render(Graphics g)
    {
        g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;

        var centerX = Position.X + Size.Width / 2;
        var centerY = Position.Y + Size.Height / 2 - 10;
        var radius = Math.Min(Size.Width, Size.Height) / 2 - 10;
        var lineWidth = 12;

        using var blackPen = new Pen(Color.Black, lineWidth);
        blackPen.StartCap = LineCap.Round;
        blackPen.EndCap = LineCap.Round;

        g.DrawEllipse(blackPen, centerX - radius, centerY - radius, radius * 2, radius * 2);

        var sweepAngle = (Percentage / 100f) * 360f;
        if (sweepAngle > 0)
        {
            g.DrawArc(blackPen, centerX - radius, centerY - radius, radius * 2, radius * 2, -90, sweepAngle);
        }

        using var font = new Font("Segoe UI", 24f, FontStyle.Bold, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(Color.Black);
        var percentText = $"{Percentage}%";
        var textSize = g.MeasureString(percentText, font);
        g.DrawString(percentText, font, brush, centerX - textSize.Width / 2, centerY - textSize.Height / 2);

        using var labelFont = new Font("Segoe UI", 12f, FontStyle.Regular, GraphicsUnit.Pixel);
        var labelSize = g.MeasureString(Label, labelFont);
        g.DrawString(Label, labelFont, brush, centerX - labelSize.Width / 2, centerY + radius + 5);
    }
}
