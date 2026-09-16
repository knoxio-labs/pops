import DesignSystem
import SwiftUI

/// A result and how old the phone's knowledge of it is.
internal struct InventoryLookupResult: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    internal let minutesSinceSync: Int

    internal var id: String { item.id }

    internal var isStale: Bool {
        InventoryStaleness.disclosure(minutesSinceSync: minutesSinceSync) != .silent
    }
}

/// Searching and scanning against a copy that may be behind.
///
/// The one place age is genuinely load-bearing: a person reading a shelf
/// location is about to walk to it, and being sent to the wrong room by a
/// three-day-old answer costs more than any amount of marking would. What is
/// open is how that age is said, not whether.
internal struct InventoryLookupScreen: View {
    internal let results: [InventoryLookupResult]
    /// A scanned code the local copy has never seen. Findable only online, and
    /// the screen has to say which of the two it is.
    internal let showsUnknownCode: Bool
    @Environment(\.inventorySyncStyle) private var style

    internal init(results: [InventoryLookupResult], showsUnknownCode: Bool = false) {
        self.results = results
        self.showsUnknownCode = showsUnknownCode
    }

    internal var body: some View {
        List {
            if showsUnknownCode {
                Section { InventoryUnknownCodeNotice() }
            }
            if style.staleDisclosure == .bannerOverResults, let oldest {
                Section { InventoryStaleResultsBanner(minutesSinceSync: oldest) }
            }
            Section("3 matches") {
                ForEach(results) { result in
                    InventoryLookupRow(result: result)
                }
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle("cable")
        .playgroundTitleDisplay(large: false)
        .tint(.popsInventory)
    }

    private var oldest: Int? {
        results.map(\.minutesSinceSync).max()
    }
}

/// One result, with its age said the way the style says it.
internal struct InventoryLookupRow: View {
    internal let result: InventoryLookupResult
    @Environment(\.inventorySyncStyle) private var style

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            InventoryItemRow(item: shown)
            if style.staleDisclosure == .ageOnRow && result.isStale {
                Text("This phone last heard about it \(age)")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private var age: String {
        InventoryStaleness.age(minutesSinceSync: result.minutesSinceSync)
    }

    /// Under a glyph-only disclosure the row's own sync mark carries the age,
    /// so the item is handed to the row already stale. Under the other two the
    /// words do it and a second mark would be the same fact twice.
    private var shown: InventoryFoundationItem {
        guard style.staleDisclosure == .glyphOnly, result.isStale else { return result.item }
        var copy = result.item
        copy.sync = .stale
        return copy
    }
}

/// The age of the whole answer, once, above it.
internal struct InventoryStaleResultsBanner: View {
    internal let minutesSinceSync: Int

    internal var body: some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: InventorySymbol.stale.system)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsWarning)
                .accessibilityHidden(true)
            Text(
                "Searching this phone's copy, last updated "
                    + "\(InventoryStaleness.age(minutesSinceSync: minutesSinceSync)). "
                    + "Anything moved since will still show where it was."
            )
            .font(.popsSubheadline)
            .foregroundStyle(Color.popsMutedForeground)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A scanned label this phone has never seen.
///
/// Says which of the two it is, a code that does not exist or one this copy
/// has not been told about, because they lead to different next moves and a
/// shared "not found" would hide that.
internal struct InventoryUnknownCodeNotice: View {
    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            PopsStatusHeader(
                tone: .information,
                title: "B771 is not in this phone's copy",
                message:
                    "It may have been labelled somewhere else since this phone last synced. "
                    + "POPS will know; this phone cannot say yet.",
                caption: "Last synced 3 days ago")
            Button("Label something with B771") {}
                .font(.popsSubheadline.weight(.semibold))
                .playgroundGlassButton()
                .tint(.popsInventory)
        }
    }
}

/// The fixtures the lookup screens run on.
internal enum InventoryLookupFixtures {
    internal static let results: [InventoryLookupResult] = [
        InventoryLookupResult(item: InventoryFoundationFixtures.cable, minutesSinceSync: 3 * 60),
        InventoryLookupResult(item: InventoryFoundationFixtures.espresso, minutesSinceSync: 12),
        InventoryLookupResult(
            item: InventoryFoundationFixtures.television, minutesSinceSync: 4 * 24 * 60),
    ]

    internal static let fresh: [InventoryLookupResult] = results.map {
        InventoryLookupResult(item: $0.item, minutesSinceSync: 2)
    }
}
