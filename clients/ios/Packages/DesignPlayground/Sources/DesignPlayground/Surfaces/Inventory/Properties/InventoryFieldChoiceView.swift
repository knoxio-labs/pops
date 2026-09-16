import DesignSystem
import SwiftUI

/// How Furniture's twelve-entry Material field is offered while it is being
/// filled in.
///
/// Twelve is deliberately past what a row of chips holds on a 393pt phone, so
/// the three presentations separate rather than looking like the same list
/// with different chrome.
internal struct InventoryFieldChoiceView: View {
    internal let presentation: InventoryFieldStyle.ChoicePresentation

    private var field: InventoryTemplateField {
        InventoryPropertyTemplates.furniture.fields.first { $0.key == "Material" }
            ?? InventoryTemplateField("Material", "Choice")
    }

    internal var body: some View {
        List {
            Section { InventoryThingHeader(thing: InventoryFieldFixtures.choosingMaterial) }
            Section {
                content
            } header: {
                Text(field.key)
            } footer: {
                Text("\(field.choices?.count ?? 0) values, declared by Furniture's type.")
            }
        }
        .playgroundInsetGroupedList()
    }

    @ViewBuilder private var content: some View {
        switch presentation {
        case .inlineChips: chips
        case .sheetList: rows(searchable: false)
        case .searchableList: rows(searchable: true)
        }
    }

    private var chips: some View {
        InventoryChipFlow(spacing: PopsSpacing.sm) {
            ForEach(field.choices ?? [], id: \.self) { InventoryPropertyChip($0) }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    @ViewBuilder
    private func rows(searchable: Bool) -> some View {
        ForEach(field.choices ?? [], id: \.self) { choice in
            HStack {
                Text(choice).font(.popsBody).foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
            }
        }
        if searchable {
            Text("Typing narrows the list above; nothing here is a filter yet.")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }
}
