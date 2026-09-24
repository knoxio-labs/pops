import AppCore
import SwiftUI

/// The Show picker's options, in the order the field presents them.
public func purchasesSearchKindOptions() -> [PurchasesSearchKind] {
    PurchasesSearchKind.allCases
}

/// The Status picker's options, in the order the field presents them.
///
/// `PurchaseSearchStatus` is not `CaseIterable` (it is a server-side
/// settlement filter shared beyond this view), so the order is spelled out
/// here rather than derived.
public func purchasesSearchStatusOptions() -> [PurchaseSearchStatus] {
    [.any, .unmatched, .matched, .partial, .cash, .ignored]
}

/// Purchases' Show and Status pickers, and the Tags row, for use in a shared filter form.
public struct PurchasesSearchFilterFields<Header: View>: View {
    @Binding private var filter: PurchasesSearchFilter
    private let tags: [PurchaseTagCount]
    @ViewBuilder private let header: () -> Header

    /// Creates Purchases filter fields with a caller-provided section header.
    public init(
        filter: Binding<PurchasesSearchFilter>,
        tags: [PurchaseTagCount],
        @ViewBuilder header: @escaping () -> Header
    ) {
        _filter = filter
        self.tags = tags
        self.header = header
    }

    public var body: some View {
        Section {
            Picker("Show", selection: $filter.kind) {
                ForEach(purchasesSearchKindOptions(), id: \.self) { Text($0.title).tag($0) }
            }
            Picker("Status", selection: $filter.status) {
                ForEach(purchasesSearchStatusOptions(), id: \.self) { Text($0.title).tag($0) }
            }
            NavigationLink {
                PurchasesTagPicker(selection: $filter.tags, tags: tags)
            } label: {
                LabeledContent("Tags", value: filter.tagSummary ?? "Any")
            }
        } header: {
            header()
        }
        .pickerStyle(.menu)
    }
}

extension PurchasesSearchFilterFields where Header == EmptyView {
    /// Creates Purchases filter fields without a section header.
    public init(filter: Binding<PurchasesSearchFilter>, tags: [PurchaseTagCount]) {
        self.init(filter: filter, tags: tags) { EmptyView() }
    }
}
