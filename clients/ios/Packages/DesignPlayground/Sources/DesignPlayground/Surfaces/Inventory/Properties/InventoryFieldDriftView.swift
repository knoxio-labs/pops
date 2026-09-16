import DesignSystem
import SwiftUI

/// What the phone shows when Fitting's list narrows under a bulb already
/// recording the value that dropped out.
///
/// The bulb itself never changes here, only the notice beside its Fitting
/// line, so the three variants are a comparison of how loud "this used to be
/// valid" gets rather than of three different objects.
internal struct InventoryFieldDriftView: View {
    internal let treatment: InventoryFieldStyle.DriftTreatment

    private var thing: InventoryThing { InventoryFieldFixtures.driftedBulb }
    private var fitting: InventoryProperty {
        thing.properties.first { $0.key == "Fitting" } ?? InventoryProperty("Fitting", .text(""))
    }

    internal var body: some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                ForEach(thing.properties) { property in
                    row(for: property)
                }
            } header: {
                Text(thing.template?.name ?? "")
            } footer: {
                Text(footer)
            }
            Section {
                InventoryPropertyLine(key: "Recorded against", value: recordedChoices)
                InventoryPropertyLine(key: "Declared today", value: currentChoices)
            } header: {
                Text("What the type asked for, then and now")
            }
        }
        .playgroundInsetGroupedList()
    }

    private var recordedChoices: String {
        InventoryFieldFixtures.driftedBulbField.choices?.joined(separator: ", ") ?? ""
    }

    private var currentChoices: String {
        (InventoryPropertyTemplates.bulb.fields.first { $0.key == "Fitting" }?.choices ?? [])
            .joined(separator: ", ")
    }

    private func line(_ property: InventoryProperty) -> some View {
        InventoryPropertyLine(key: property.key, value: property.value.display)
    }

    @ViewBuilder
    private func row(for property: InventoryProperty) -> some View {
        if property.key == "Fitting" {
            fittingLine
        } else {
            line(property)
        }
    }

    @ViewBuilder private var fittingLine: some View {
        switch treatment {
        case .flaggedInline:
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                line(fitting)
                InventoryPropertyProblem(
                    message: "E14 is no longer a Fitting value",
                    resolution: "Kept as recorded. Choose a current fitting to update it.",
                    tone: .popsWarning)
            }
        case .grayedLegacy:
            HStack {
                InventoryPropertyLine(
                    key: fitting.key, value: fitting.value.display, tone: .popsMutedForeground)
                Spacer(minLength: PopsSpacing.sm)
                InventoryPropertyChip("No longer offered", tone: .popsMutedForeground)
            }
        case .silentlyKept:
            line(fitting)
        }
    }

    private var footer: String {
        switch treatment {
        case .flaggedInline: "The bulb's own record did not change; the type's list did."
        case .grayedLegacy: "Muted rather than warned. The value still reads, just not as current."
        case .silentlyKept: "Nothing here says the list moved. This is the cost of doing nothing."
        }
    }
}
