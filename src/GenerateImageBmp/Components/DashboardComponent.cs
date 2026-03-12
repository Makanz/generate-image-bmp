using System.Drawing;

namespace GenerateImageBmp.Components;

public abstract class DashboardComponent
{
    public Point Position { get; init; }
    public Size Size { get; init; }

    public abstract void Render(Graphics g);
}
