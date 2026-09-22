import DesignSystem
import SwiftUI

internal struct InventorySelectionPanel<Row: Identifiable, Content: View>: View {
    internal let rows: [Row]
    @ViewBuilder internal let content: (Row) -> Content

    internal var body: some View {
        InventoryGroundedListPanel {
            PopsDividedRows(rows: rows, content: content)
        }
    }
}
