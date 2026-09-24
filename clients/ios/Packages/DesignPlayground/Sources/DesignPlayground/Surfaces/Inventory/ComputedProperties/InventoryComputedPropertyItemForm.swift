import DesignSystem
import SwiftUI

internal struct InventoryComputedPropertyItemForm: View {
    internal let openingState: InventoryComputedValueState
    internal var missingInputs: InventoryMissingInputsScenario?
    @State private var width: String
    @State private var height = "30"
    @State private var depth = "25"
    @State private var capacity: String
    @State private var isOverridden: Bool

    internal init(
        openingState: InventoryComputedValueState,
        missingInputs: InventoryMissingInputsScenario? = nil
    ) {
        self.openingState = openingState
        self.missingInputs = missingInputs
        _width = State(initialValue: openingState == .unavailable ? "" : "40")
        _capacity = State(
            initialValue: openingState == .unavailable
                ? "" : openingState == .overridden ? "32" : "30")
        _isOverridden = State(initialValue: openingState == .overridden)
    }

    internal var body: some View {
        Form {
            Section("Item") {
                LabeledContent("Name", value: "Clear storage box")
                LabeledContent("Type", value: "Storage box")
            }
            Section("Dimensions") {
                measurementRow("Width", value: $width, unit: "cm")
                measurementRow("Height", value: $height, unit: "cm")
                measurementRow("Depth", value: $depth, unit: "cm")
            }
            capacitySection
        }
        .playgroundInsetGroupedList()
        .navigationTitle("Edit item")
        .playgroundTitleDisplay(large: false)
        .playgroundTrailingBarItem {
            Button("Save") {}
                .playgroundProminentGlassButton()
                .tint(.popsInventory)
        }
        .tint(.popsInventory)
    }

    private var capacitySection: some View {
        Section {
            LabeledContent {
                HStack(spacing: PopsSpacing.sm) {
                    TextField("Not calculated", text: capacityBinding)
                        .multilineTextAlignment(.trailing)
                        .playgroundDecimalKeyboard()
                    Text("L")
                        .foregroundStyle(Color.popsMutedForeground)
                }
            } label: {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("Capacity")
                    if let missingInputs {
                        Text(missingInputs.summary)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsWarning)
                    } else {
                        Label(valueState.rawValue, systemImage: valueStateSymbol)
                            .font(.popsCaption)
                            .foregroundStyle(valueStateTone)
                    }
                }
            }
            if let missingInputs, !missingInputs.rows.isEmpty {
                InventoryMissingInputRows(rows: missingInputs.rows)
            }
            Button(isOverridden ? "Use calculation" : "Calculate") {
                calculate()
            }
            .disabled(calculatedCapacity == nil)
        } header: {
            Text("Computed property")
        } footer: {
            Text(capacityFooter)
        }
    }

    private var capacityBinding: Binding<String> {
        Binding(
            get: { capacity },
            set: {
                capacity = $0
                isOverridden = true
            }
        )
    }

    private var calculatedCapacity: String? {
        StorageBoxCapacity.litres(width: width, height: height, depth: depth)
    }

    private var valueState: InventoryComputedValueState {
        if isOverridden { return .overridden }
        return calculatedCapacity == nil ? .unavailable : .calculated
    }

    private var valueStateSymbol: String {
        switch valueState {
        case .calculated: "function"
        case .overridden: "pencil"
        case .unavailable: "exclamationmark.circle"
        }
    }

    private var valueStateTone: Color {
        valueState == .unavailable ? .popsWarning : .popsInventory
    }

    private var capacityFooter: String {
        if calculatedCapacity == nil {
            return "Enter width, height and depth before calculating capacity."
        }
        return
            "Width × height × depth ÷ 1000. The result is stored when you save and does not update automatically."
    }

    private func measurementRow(_ label: String, value: Binding<String>, unit: String) -> some View
    {
        LabeledContent(label) {
            HStack(spacing: PopsSpacing.sm) {
                TextField("Not recorded", text: value)
                    .multilineTextAlignment(.trailing)
                    .playgroundDecimalKeyboard()
                Text(unit)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private func calculate() {
        guard let calculatedCapacity else { return }
        capacity = calculatedCapacity
        isOverridden = false
    }
}
