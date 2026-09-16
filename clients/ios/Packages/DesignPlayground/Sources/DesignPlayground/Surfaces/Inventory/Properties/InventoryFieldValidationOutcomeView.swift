import DesignSystem
import SwiftUI

/// What happens to a Fitting value nothing on the type's list matches, mid
/// edit.
///
/// ``InventoryFieldValidation`` decides the outcome is `outsideChoices`; this
/// is the three things a screen could do with that outcome, not three ways of
/// computing it.
internal struct InventoryFieldValidationOutcomeView: View {
    internal let outcome: InventoryFieldStyle.ValidationOutcome

    private var thing: InventoryThing { InventoryFieldFixtures.enteringUnknownFitting }
    private var field: InventoryTemplateField {
        InventoryPropertyTemplates.bulb.fields.first { $0.key == "Fitting" }
            ?? InventoryTemplateField("Fitting", "Choice")
    }
    private var fitting: InventoryProperty {
        thing.properties.first { $0.key == "Fitting" } ?? InventoryProperty("Fitting", .text(""))
    }

    internal var body: some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                InventoryPropertyLine(key: fitting.key, value: fitting.value.display)
                if InventoryFieldValidation.validate(fitting.value, against: field) != .valid {
                    notice
                }
            } header: {
                Text("Fitting")
            }
            saveRow
        }
        .playgroundInsetGroupedList()
    }

    @ViewBuilder private var notice: some View {
        switch outcome {
        case .blocksSave:
            InventoryPropertyProblem(
                message: "\"E5\" is not a Fitting POPS knows",
                resolution: "Choose one from the list to save.", tone: .popsDestructive)
        case .parksForReview:
            InventoryPropertyProblem(
                message: "\"E5\" is not a Fitting POPS knows",
                resolution: "Saved anyway, marked for review.", tone: .popsWarning)
        case .suggestsCorrection:
            InventoryPropertyProblem(
                message: "\"E5\" is not a Fitting POPS knows",
                resolution: "Closest match: E27. Tap to accept, or keep typing.", tone: .popsWarning
            )
        }
    }

    private var saveRow: some View {
        Section {
            Text(saveLabel).font(.popsBody.weight(.semibold)).foregroundStyle(saveTone)
        } footer: {
            Text(saveFooter)
        }
    }

    private var saveLabel: String {
        outcome == .blocksSave ? "Save (disabled)" : "Save"
    }

    private var saveTone: Color {
        outcome == .blocksSave ? .popsMutedForeground : .popsAccent
    }

    private var saveFooter: String {
        switch outcome {
        case .blocksSave: "Nothing is written until Fitting is a value the type declares."
        case .parksForReview:
            "The item is saved with a needs-attention mark until the value is fixed."
        case .suggestsCorrection: "Save stays disabled while the suggestion is unresolved."
        }
    }
}
