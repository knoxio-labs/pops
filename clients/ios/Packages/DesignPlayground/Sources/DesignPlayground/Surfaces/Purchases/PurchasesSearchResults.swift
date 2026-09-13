import AppCore
import DesignSystem
import SwiftUI

/// What a search over the purchase history answers with.
///
/// Two kinds of hit, kept apart because they are different answers to
/// different questions. A purchase matched on its merchant answers "what did I
/// spend at Bunnings"; a line matched on its product name answers "which order
/// had the drill in it", and the pillar's own search returns both, every line
/// hit carrying the id of the order it belongs to.
///
/// Matching here is a case-insensitive substring over what the pillar searches:
/// the merchant's entity name *and* the wording the till printed, the product
/// name, and the item's tags. Searching both merchant names matters — a person
/// who types `bunnings` and a person who types `ALEXANDRIA` are both looking at
/// the same purchase, and only one of those strings is on screen.
internal struct PurchasesSearchResults: View {
    internal let purchases: [Purchase]
    internal let query: String

    private var trimmed: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var matchedPurchases: [Purchase] {
        guard !trimmed.isEmpty else { return [] }
        return purchases.filter { Self.matches($0.merchant, trimmed) }
    }

    private var matchedItems: [PurchaseItemHit] {
        guard !trimmed.isEmpty else { return [] }
        return PurchasesSearchFixtures.items.filter { item in
            item.name.localizedCaseInsensitiveContains(trimmed)
                || item.tags.contains { $0.localizedCaseInsensitiveContains(trimmed) }
        }
    }

    /// Both names, because the pillar is searched by the printed one and the
    /// screen shows the entity one.
    private static func matches(_ merchant: MerchantIdentity, _ query: String) -> Bool {
        switch merchant {
        case .entity(_, let name, let printed):
            name.localizedCaseInsensitiveContains(query)
                || printed.localizedCaseInsensitiveContains(query)
        case .printed(let printed):
            printed.localizedCaseInsensitiveContains(query)
        case .unattributed:
            false
        }
    }

    internal var body: some View {
        List {
            if trimmed.isEmpty {
                tagSection
            } else if matchedPurchases.isEmpty && matchedItems.isEmpty {
                nothingFound
            } else {
                purchaseSection
                itemSection
            }
        }
        .playgroundInsetGroupedList()
        .scrollContentBackground(.hidden)
        .background(Color.popsBackground)
    }

    /// The focused-but-empty state. A list of recent searches would be the
    /// obvious thing here and this is deliberately not that: nothing on the
    /// phone persists a search, and a screen that implied it did would be
    /// promising a history it cannot show. Tags are what the data itself
    /// offers as a way in.
    @ViewBuilder private var tagSection: some View {
        let tags = PurchasesSearchFixtures.tags
        if tags.isEmpty {
            Section {
                Text("Type a merchant, a product or a tag.")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        } else {
            Section("Browse by tag") {
                ForEach(tags, id: \.self) { tag in
                    Label(tag, systemImage: "tag")
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsForeground)
                }
            }
        }
    }

    private var nothingFound: some View {
        Section {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text("No purchase or item matches “\(trimmed)”.")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                Text(Self.unmatchedHint)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .padding(.vertical, PopsSpacing.xs)
        }
    }

    /// Said because it is the likeliest reason a search came back empty on
    /// this data: two of every five purchases resolve to no entity at all, and
    /// the rest are filed under whatever the till shouted.
    private static let unmatchedHint =
        "Merchant names are whatever the receipt printed, so a shop may be filed under "
        + "something you would not type."

    @ViewBuilder private var purchaseSection: some View {
        if !matchedPurchases.isEmpty {
            Section("Purchases") {
                ForEach(matchedPurchases) { purchase in
                    PurchaseCompactRow(purchase: purchase)
                }
            }
        }
    }

    /// A line hit names the purchase it came from, because a product name on
    /// its own is not something anybody can act on — the thing you open is the
    /// order.
    @ViewBuilder private var itemSection: some View {
        if !matchedItems.isEmpty {
            Section("Items") {
                ForEach(matchedItems) { item in
                    itemRow(item)
                }
            }
        }
    }

    private func itemRow(_ item: PurchaseItemHit) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                Text(Self.oneLine(item.name))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(2)
                Spacer(minLength: PopsSpacing.sm)
                Text(item.lineTotal.formatted())
                    .font(.popsSubheadline)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                    .layoutPriority(1)
            }
            Text(origin(of: item))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .lineLimit(1)
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private func origin(of item: PurchaseItemHit) -> String {
        guard let purchase = purchases.first(where: { $0.id == item.purchaseID }) else {
            return "×\(item.quantity)"
        }
        return
            "×\(item.quantity) · \(PurchasesPresentation.merchant(purchase)) · \(PurchasesPresentation.day(purchase))"
    }

    /// A till writes a line over several lines — a code, then a description,
    /// then `Price: open`. In a results list that is three rows' worth of
    /// height for one hit, so the breaks become separators and the whole line
    /// stays readable at one glance.
    private static func oneLine(_ name: String) -> String {
        name.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .joined(separator: " · ")
    }
}
