using System.Drawing;

namespace GenerateImageBmp.Components;

public sealed class DividerComponent : DashboardComponent
{
    public byte GrayLevel { get; init; } = 8;

    public DividerComponent(Point position, int width, byte grayLevel = 8)
    {
        Position = position;
        Size = new Size(width, 2);
        GrayLevel = grayLevel;
    }

    public override void Render(Graphics g)
    {
        using var brush = new SolidBrush(Color.FromArgb(GrayLevel * 17, GrayLevel * 17, GrayLevel * 17));
        g.FillRectangle(brush, Position.X, Position.Y, Size.Width, Size.Height);
    }
}
