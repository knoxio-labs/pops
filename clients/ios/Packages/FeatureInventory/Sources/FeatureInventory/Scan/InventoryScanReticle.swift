import DesignSystem
import SwiftUI

/// Four amber corners a label is lined up inside; they close in a little
/// once something is found.
internal struct InventoryScanReticle: View {
    let found: Bool

    var body: some View {
        InventoryScanReticleCorners()
            .stroke(
                Color.popsInventory,
                style: StrokeStyle(lineWidth: PopsBorder.emphasis * 2, lineCap: .round)
            )
            .aspectRatio(1, contentMode: .fit)
            .containerRelativeFrame(.horizontal) { width, _ in width * 0.62 }
            .scaleEffect(found ? 0.92 : 1)
            .inventoryMotion(InventoryMotion.smooth, value: found)
            .accessibilityHidden(true)
    }
}

internal struct InventoryScanReticleCorners: Shape {
    func path(in rect: CGRect) -> Path {
        let arm = rect.width * 0.18
        var path = Path()
        for corner in 0..<4 {
            let isLeading = corner % 2 == 0
            let isTop = corner < 2
            let tip = CGPoint(
                x: isLeading ? rect.minX : rect.maxX, y: isTop ? rect.minY : rect.maxY)
            let dx = isLeading ? arm : -arm
            let dy = isTop ? arm : -arm
            path.move(to: CGPoint(x: tip.x + dx, y: tip.y))
            path.addLine(to: tip)
            path.addLine(to: CGPoint(x: tip.x, y: tip.y + dy))
        }
        return path
    }
}
