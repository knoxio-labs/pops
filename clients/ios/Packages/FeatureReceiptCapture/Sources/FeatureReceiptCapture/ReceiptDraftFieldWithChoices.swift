import DesignSystem
import SwiftUI

/// A field that can also be chosen from.
///
/// One control and one value. The earlier shape put a menu above a text field
/// and showed both at once, which meant a form that had just read `Woolworths
/// Metro Town Hall` opened with that in a field and `Choose a merchant` in a
/// picker over it — two places for one answer, neither obviously the live one.
///
/// So the field is the value, always, and the list hangs off it: a button in
/// the trailing corner, the way a search field carries its scope. Nothing is
/// hidden behind a mode, typing is never blocked, and when there is nothing to
/// choose from the button is simply absent and this is the plain field it
/// always was.
///
/// `resolved` is drawn rather than enforced. A value that came from the list
/// gets a mark beside it, because "this is attached to a real record" and
/// "somebody typed this" are different facts about the same string and the
/// screen is the only place they can be told apart.
internal struct ReceiptDraftFieldWithChoices: View {
    internal let label: String
    internal let placeholder: String
    @Binding internal var text: String
    internal let font: Font
    internal let note: PopsFieldNote?
    internal let choices: [String]
    internal let resolved: Bool
    internal let onChoose: (String) -> Void
    internal let onType: () -> Void

    internal var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            PopsTextField(
                label,
                placeholder: placeholder,
                text: Binding(
                    get: { text },
                    set: { typed in
                        text = typed
                        onType()
                    }
                ),
                font: font,
                note: note
            )
            if resolved {
                Image(systemName: "checkmark.seal.fill")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsSuccess)
                    .accessibilityLabel(ReceiptDraftCopy.resolvedFromContacts)
            }
            if !choices.isEmpty { chooser }
        }
    }

    private var chooser: some View {
        Menu {
            ForEach(choices, id: \.self) { choice in
                Button {
                    onChoose(choice)
                } label: {
                    Label(choice, systemImage: resolvedSymbol)
                }
            }
        } label: {
            Image(systemName: "list.bullet")
                .font(.popsBody)
                .foregroundStyle(Color.popsAccent)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(ReceiptDraftCopy.chooseFromKnown)
    }

    private var resolvedSymbol: String {
        label == ReceiptDraftCopy.addressLabel ? "mappin.and.ellipse" : "building.2"
    }
}
