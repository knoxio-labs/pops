import AppCore
import SwiftUI

/// A renderer for one protocol-2 catalogue field. Stored fields remain editable;
/// computed fields show their effective values without manufacturing a write.
internal struct InventoryProtocol2FieldRow: View {
    let field: InventoryCatalogueField
    let values: [InventoryPrimitiveValue]
    let set: ([InventoryPrimitiveValue]) -> Void

    var body: some View {
        if field.storage == .computed {
            LabeledContent(field.label) { Text(rendered) }
        } else {
            editor
        }
    }

    @ViewBuilder private var editor: some View {
        switch field.kind {
        case .measurement:
            InventoryFormTextRow(field.label, placeholder: field.fixedUnit ?? "amount unit", text: textBinding)
        case .boolean:
            Toggle(field.label, isOn: Binding(
                get: { if case .boolean(let value)? = values.first { return value }; return false },
                set: { set([.boolean($0)]) }))
        case .enumeration:
            Picker(field.label, selection: Binding(
                get: { if case .enumeration(let value)? = values.first { return value }; return "" },
                set: { value in set(value.isEmpty ? [] : [.enumeration(optionId: value)]) })) {
                Text("Not recorded").tag("")
                ForEach(field.enumOptions.filter { $0.archivedAt == nil }) { option in
                    Text(option.label).tag(option.id)
                }
            }
        default:
            InventoryFormTextRow(field.label, placeholder: field.help ?? "Not recorded", text: textBinding)
        }
    }

    private var textBinding: Binding<String> {
        Binding(get: { text }, set: { value in set(value.isEmpty ? [] : parsed(value)) })
    }

    private var text: String {
        guard let value = values.first else { return "" }
        return switch value {
        case .string(let value): value
        case .integer(let value): String(value.value)
        case .decimal(let value): value.text
        case .date(let value): value.text
        case .dateTime(let value): value.text
        case .url(let value): value.text
        case .measurement(let amount, let unit): "\(amount.text) \(unit)"
        case .reference(let value): value.targetId
        case .boolean, .enumeration: ""
        }
    }

    private var rendered: String { text.isEmpty ? "Not available" : text }

    private func parsed(_ value: String) -> [InventoryPrimitiveValue] {
        switch field.kind {
        case .shortText, .longText: return [.string(value)]
        case .integer:
            guard let number = Int64(value), let integer = try? InventoryInteger(number) else { return [] }
            return [.integer(integer)]
        case .decimal:
            guard let decimal = try? InventoryDecimal(value) else { return [] }
            return [.decimal(decimal)]
        case .date:
            guard let date = try? InventoryCanonicalDate(value) else { return [] }
            return [.date(date)]
        case .dateTime:
            guard let date = try? InventoryCanonicalDateTime(value) else { return [] }
            return [.dateTime(date)]
        case .url:
            guard let url = try? InventoryCanonicalURL(value) else { return [] }
            return [.url(url)]
        case .reference: return [.reference(.init(targetKind: .item, targetId: value))]
        case .measurement:
            let parts = value.split(separator: " ", maxSplits: 1).map(String.init)
            guard let amountText = parts.first, let amount = try? InventoryDecimal(amountText) else { return [] }
            let unit = parts.count == 2 ? parts[1] : field.fixedUnit ?? ""
            guard !unit.isEmpty, field.fixedUnit == nil || unit == field.fixedUnit else { return [] }
            return [.measurement(amount: amount, unit: unit)]
        case .boolean, .enumeration: return []
        }
    }
}
