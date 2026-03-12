using System.Drawing;
using System.Drawing.Text;

namespace GenerateImageBmp.Components;

public sealed class TextComponent : DashboardComponent
{
    public string Title { get; init; } = "";
    public string Value { get; init; } = "";
    public Font? TitleFont { get; init; }
    public Font? ValueFont { get; init; }

    public TextComponent(string title, string value, Point position, Size? size = null)
    {
        Title = title;
        Value = value;
        Position = position;
        Size = size ?? new Size(200, 80);
    }

    public override void Render(Graphics g)
    {
        g.TextRenderingHint = TextRenderingHint.SingleBitPerPixelGridFit;

        var titleFont = TitleFont ?? new Font("Segoe UI", 14f, FontStyle.Regular, GraphicsUnit.Pixel);
        var valueFont = ValueFont ?? new Font("Segoe UI", 28f, FontStyle.Bold, GraphicsUnit.Pixel);

        using (titleFont)
        using (valueFont)
        using (var titleBrush = new SolidBrush(Color.Black))
        using (var valueBrush = new SolidBrush(Color.Black))
        {
            g.DrawString(Title, titleFont, titleBrush, Position.X, Position.Y);
            g.DrawString(Value, valueFont, valueBrush, Position.X, Position.Y + 24);
        }
    }
}
