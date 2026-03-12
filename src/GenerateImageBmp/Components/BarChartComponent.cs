using System.Drawing;

namespace GenerateImageBmp.Components;

public sealed class BarChartComponent : DashboardComponent
{
    public IReadOnlyList<BarData> Bars { get; }
    public float MaxValue { get; }

    public BarChartComponent(IReadOnlyList<BarData> bars, Point position, Size? size = null)
    {
        Bars = bars;
        MaxValue = bars.Count > 0 ? MathF.Max(bars.Max(b => b.Value), 1f) : 1f;
        Position = position;
        Size = size ?? new Size(350, 150);
    }

    public override void Render(Graphics g)
    {
        var barCount = Bars.Count;
        if (barCount == 0) return;

        var padding = 10;
        var labelHeight = 20;
        var availableWidth = Size.Width - padding * 2;
        var availableHeight = Size.Height - labelHeight - padding * 2;
        var barWidth = (availableWidth - padding * (barCount - 1)) / barCount;

        using var blackBrush = new SolidBrush(Color.Black);
        using var font = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Pixel);

        for (var i = 0; i < barCount; i++)
        {
            var bar = Bars[i];
            var barHeight = (bar.Value / MaxValue) * availableHeight;

            var x = Position.X + padding + i * (barWidth + padding);
            var y = Position.Y + padding + (availableHeight - barHeight);

            g.FillRectangle(blackBrush, x, y, barWidth, barHeight);
            g.DrawString(bar.Label, font, blackBrush, x, Position.Y + padding + availableHeight + 2);
        }
    }
}

public readonly struct BarData
{
    public string Label { get; init; }
    public float Value { get; init; }

    public BarData(string label, float value)
    {
        Label = label;
        Value = value;
    }
}
