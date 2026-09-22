import DesignSystem
import SwiftUI

internal enum InventoryTypeDefinitionStage {
    case fields
    case calculation
}

internal struct InventoryTypeDefinitionView: View {
    internal let stage: InventoryTypeDefinitionStage

    internal var body: some View {
        Form {
            switch stage {
            case .fields: fields
            case .calculation: calculation
            }
        }
        .playgroundInsetGroupedList()
        .navigationTitle(stage == .fields ? "Storage box" : "Capacity")
        .playgroundTitleDisplay(large: false)
        .playgroundTrailingBarItem {
            Button("Save") {}
                .playgroundProminentGlassButton()
                .tint(.popsInventory)
        }
        .tint(.popsInventory)
    }

    private var fields: some View {
        Group {
            Section("Item type") {
                LabeledContent("Name", value: "Storage box")
                LabeledContent("Items using this type", value: "14")
            }
            Section("Properties") {
                definitionRow("Width", detail: "Number · cm", symbol: "ruler")
                definitionRow("Height", detail: "Number · cm", symbol: "ruler")
                definitionRow("Depth", detail: "Number · cm", symbol: "ruler")
                definitionRow(
                    "Capacity",
                    detail: InventoryComputedPropertyDefinition.capacity.formula,
                    symbol: "function",
                    badge: "Computed"
                )
            }
        }
    }

    private var calculation: some View {
        Group {
            Section("Result") {
                LabeledContent("Property", value: "Capacity")
                LabeledContent("Unit", value: "L")
            }
            Section {
                ForEach(Array(calculationSteps.enumerated()), id: \.offset) { index, step in
                    LabeledContent(index == 0 ? "Start with" : step.operation) {
                        Text(step.value)
                    }
                }
                Button {
                } label: {
                    Label("Add step", systemImage: "plus")
                }
            } header: {
                Text("Calculation")
            } footer: {
                Text("40 × 30 × 25 ÷ 1000 = 30 L")
                    .monospacedDigit()
            }
            Section {
                Toggle("Allow manual override", isOn: .constant(true))
            } footer: {
                Text("An item can store a value different from this calculation.")
            }
        }
    }

    private var calculationSteps: [(operation: String, value: String)] {
        [
            ("", "Width"),
            ("Multiply by", "Height"),
            ("Multiply by", "Depth"),
            ("Divide by", "1000"),
        ]
    }

    private func definitionRow(
        _ name: String,
        detail: String,
        symbol: String,
        badge: String? = nil
    ) -> some View {
        HStack(spacing: PopsSpacing.md) {
            Image(systemName: symbol)
                .foregroundStyle(Color.popsInventory)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                HStack(spacing: PopsSpacing.sm) {
                    Text(name)
                    if let badge {
                        Text(badge)
                            .font(.popsCaption.weight(.semibold))
                            .foregroundStyle(Color.popsInventory)
                    }
                }
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            Spacer(minLength: PopsSpacing.sm)
            Image(systemName: "chevron.right")
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
    }
}
