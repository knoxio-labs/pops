import DesignSystem
import SwiftUI

/// Every state POPS-3989 requires, in the grounded-dashboard language
/// POPS-3981 decided: opaque panels, title-weight section headers, no strong
/// colour except where a container needs it.
internal struct InventoryLifecycleGallery: View {
    private typealias Fixtures = InventoryLifecycleFixtures
    @State private var scope: InventoryLifecycleScope = .active

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                InventoryLifecycleScopeChips(scope: $scope)
                    .padding(.horizontal, PopsSpacing.lg)
                section("Active, one reduced", status: "2") {
                    row(InventoryFoundationFixtures.television)
                    PopsDivider()
                    row(Fixtures.paintCans)
                }
                section("No longer counted", status: "3") {
                    disposition(Fixtures.oldSofa)
                    PopsDivider()
                    disposition(Fixtures.retiredCamera)
                    PopsDivider()
                    disposition(Fixtures.restoredKettle)
                }
                section("Needs a look", status: "2") {
                    row(Fixtures.queuedDiscard)
                    PopsDivider()
                    InventoryLifecycleRejectionRow(rejection: Fixtures.rejection)
                }
                section("Conflicting edit", status: "1") {
                    InventoryRepairRow(
                        item: Fixtures.conflictedLifecycle,
                        problem: "Marked destroyed here, retired on the web.",
                        resolution: "Choose which one happened")
                }
                section("Container, still full", status: "1") {
                    row(Fixtures.packedBox)
                    PopsDivider()
                    InventoryLifecycleContainerEmptyOutcome(
                        container: InventoryFoundationFixtures.linenBox)
                }
                section("Recent work", status: "Undo available") {
                    ForEach(Fixtures.timeline.suffix(2)) {
                        InventoryLifecycleRecentlyChangedRow(event: $0)
                    }
                }
                InventoryLifecycleScopeEmptyState(scope: .inactiveOnly)
                    .padding(.horizontal, PopsSpacing.lg)
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.md)
        }
        .background(Color.popsBackground)
        .tint(.popsInventory)
    }

    private func disposition(_ item: InventoryFoundationItem) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryItemRow(item: item).environment(\.inventoryStyle, InventoryFoundationStyle())
            InventoryLifecycleDispositionSummary(item: item, reason: Fixtures.reasons[item.id])
        }
    }

    private func row(_ item: InventoryFoundationItem) -> some View {
        InventoryItemRow(item: item).environment(\.inventoryStyle, InventoryFoundationStyle())
    }

    private func section<Content: View>(
        _ title: String,
        status: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            InventoryGroundedSectionHeader(title: title, status: status)
            InventoryGroundedListPanel {
                VStack(alignment: .leading, spacing: PopsSpacing.zero) { content() }
            }
        }
    }
}
