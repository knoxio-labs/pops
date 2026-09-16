import DesignSystem
import SwiftUI

/// Inventory's product components, each in every state POPS-3979 requires.
///
/// Separate from ``ComponentCatalog``, which is the DesignSystem's primitives
/// and says so. These are built out of those primitives and speak ADR-001's
/// vocabulary; later Inventory tickets reference them by id rather than
/// drawing their own.
@MainActor
internal enum InventoryComponentCatalog {
    internal static let all: [DesignComponent] = [
        itemRow, placementPath, badges, supportingRows, stateNotices, actions, symbols,
    ]

    private static let itemRow = DesignComponent(
        id: "inventory-item-row",
        name: "InventoryItemRow",
        synopsis:
            "One row for items and containers alike, because a container is an item. Every open "
            + "question about rows reaches it through the style rather than a parameter.",
        states: InventoryFoundationFixtures.all.map { item in
            DesignState(item.id, item.name) { rows { InventoryItemRow(item: item) } }
        }
    )

    private static let placementPath = DesignComponent(
        id: "inventory-placement-path",
        name: "InventoryPlacementPath",
        synopsis:
            "Room to the thing holding the item. Collapses to room … container when it will not fit, "
            + "because the two ends are what a reader needs.",
        states: [
            DesignState("direct", "Direct") {
                rows {
                    InventoryPlacementPath(
                        placement: InventoryFoundationFixtures.television.placement)
                }
            },
            DesignState("nested", "Nested") {
                rows {
                    InventoryPlacementPath(placement: InventoryFoundationFixtures.screws.placement)
                }
            },
            DesignState("carried", "Container being carried") {
                rows {
                    InventoryPlacementPath(
                        placement: InventoryFoundationFixtures.espresso.placement)
                }
            },
            DesignState("in-hand", "In hand") {
                rows {
                    InventoryPlacementPath(
                        placement: InventoryFoundationFixtures.passport.placement)
                }
            },
        ]
    )

    private static let badges = DesignComponent(
        id: "inventory-badges",
        name: "Inventory badges",
        synopsis:
            "Code, quantity, state and sync. A code appears only on labelled items; quantity only when it "
            + "is not one; lifecycle only when it is not active; sync only in the tiers the style shows.",
        states: [
            DesignState("code", "Inventory code") {
                rows {
                    InventoryCodeBadge(code: "K7Q2")
                    InventoryCodeBadge(code: "BREW-2026-0007-A")
                }
            },
            DesignState("quantity", "Quantity") {
                rows {
                    ForEach([1, 12, 120, 0], id: \.self) { count in
                        LabeledContent("\(count)") {
                            InventoryQuantityBadge(quantity: .init(count: count))
                        }
                    }
                }
            },
            DesignState("state", "State") {
                rows {
                    ForEach(marked) { item in
                        LabeledContent(item.name) {
                            HStack {
                                ForEach(InventoryStateMark.marks(for: item)) {
                                    InventoryStateBadge(mark: $0)
                                }
                            }
                        }
                    }
                }
            },
            DesignState("sync", "Sync, every tier") {
                rows {
                    ForEach(InventorySync.allCases, id: \.self) { sync in
                        LabeledContent(sync.label) { InventorySyncMarker(sync: sync) }
                    }
                }
                .environment(
                    \.inventoryStyle, InventoryFoundationStyle(syncVisibility: .everything))
            },
        ]
    )

    private static let supportingRows = DesignComponent(
        id: "inventory-supporting-rows",
        name: "Location, in-hand, activity and repair rows",
        synopsis:
            "The rows that are not a catalogue entry, each carrying the one thing it exists to say.",
        states: [
            DesignState("location", "Location") {
                rows {
                    InventoryLocationRow(
                        name: "Garage", parent: nil, itemCount: 64, containerCount: 3)
                    InventoryLocationRow(
                        name: "Pantry shelf", parent: "Kitchen", itemCount: 11, containerCount: 0)
                }
            },
            DesignState("in-hand", "In hand") {
                rows { InventoryInHandRow(item: InventoryFoundationFixtures.passport) }
            },
            DesignState("activity", "Activity") {
                rows {
                    InventoryActivityRow(
                        verb: "Picked up", subject: "Passport", detail: "From Documents drawer",
                        when: "8 min ago")
                    InventoryActivityRow(
                        verb: "Closed", subject: "Linen 02", detail: "19 items", when: "Yesterday")
                }
            },
            DesignState("repair", "Repair") {
                rows {
                    InventoryRepairRow(
                        item: InventoryFoundationFixtures.conflicted,
                        problem: "Moved to Office 04 here, and to the hall cupboard on the web.",
                        resolution: "Choose where it is")
                }
            },
        ]
    )

    private static let stateNotices = DesignComponent(
        id: "inventory-state-notices",
        name: "InventoryStateNotice",
        synopsis:
            "The DesignSystem's state primitives, saying what happened in Inventory's words and what to do next.",
        states: InventoryStateNoticeKind.allCases.map { kind in
            DesignState(kind.rawValue, kind.title) { InventoryStateNotice(kind: kind) }
        }
    )

    private static let actions = DesignComponent(
        id: "inventory-actions",
        name: "InventoryActionList",
        synopsis:
            "An item's actions, grouped by what they change. Red only for what cannot be undone — "
            + "discarding can be, so it is not.",
        states: [
            DesignState("item", "Item") {
                InventoryActionList(item: InventoryFoundationFixtures.screws)
            },
            DesignState("open-container", "Open container") {
                InventoryActionList(item: InventoryFoundationFixtures.kitchenBox)
            },
            DesignState("in-hand", "In hand") {
                InventoryActionList(item: InventoryFoundationFixtures.passport)
            },
            DesignState("discarded", "Discarded") {
                InventoryActionList(item: InventoryFoundationFixtures.kettle)
            },
            DesignState("destroyed", "Destroyed") {
                InventoryActionList(item: InventoryFoundationFixtures.lamp)
            },
        ]
    )

    private static let symbols = DesignComponent(
        id: "inventory-symbols",
        name: "InventorySymbol",
        synopsis:
            "One glyph per concept, with the Lucide icon the web client draws for the same one.",
        states: [
            DesignState("table", "Table") {
                rows {
                    ForEach(InventorySymbol.all, id: \.name) { entry in
                        LabeledContent {
                            Text(entry.symbol.lucide).font(.popsMonospacedCaption)
                        } label: {
                            Label(entry.name, systemImage: entry.symbol.system)
                        }
                    }
                }
            }
        ]
    )

    /// The fixtures that have a state worth marking — the rest would draw an
    /// empty row.
    private static let marked = InventoryFoundationFixtures.all.filter {
        !InventoryStateMark.marks(for: $0).isEmpty
    }

    private static func rows<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        List { Section { content() } }
            .playgroundInsetGroupedList()
    }
}
