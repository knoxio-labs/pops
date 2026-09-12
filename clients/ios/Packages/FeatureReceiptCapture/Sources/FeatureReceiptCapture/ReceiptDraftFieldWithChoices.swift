import DesignSystem
import SwiftUI

/// A field whose value can also be chosen from a list.
///
/// One control and one value. An earlier shape put a menu above a text field
/// and showed both at once, which meant a form that had just read
/// `WOOLWORTHS METRO TOWN HALL` opened with that in a field and `Choose a
/// merchant` in a picker over it — two places for one answer, neither
/// obviously the live one.
///
/// So the field is the value, always, and the list opens from a button beside
/// it. Typing is never blocked, and where there is nothing to choose from the
/// button is absent and this is the plain field it always was.
///
/// ## A sheet, not a menu
///
/// A `Menu` was right for four capture sources and is wrong here. There will
/// be hundreds of merchants: a menu renders all of them in one scrolling
/// column with no way to narrow it, which is a list somebody reads rather
/// than a list somebody finds something in. The sheet searches.
///
/// ## Three states, not two
///
/// The mark beside the value says where it came from. A merchant the server
/// matched is a *proposal* — nobody has looked at it — and one a person
/// picked is asserted. Drawing them the same would collect agreement nobody
/// gave, which is the distinction `MerchantResolution` exists for and the one
/// the pillar already draws with `confirmedAt` on every tag and kind.
internal struct ReceiptDraftFieldWithChoices: View {
    internal let label: String
    internal let placeholder: String
    @Binding internal var text: String
    internal let font: Font
    internal let note: PopsFieldNote?
    internal let choices: [String]
    internal let resolution: MerchantResolution
    internal let onChoose: (String) -> Void
    internal let onType: () -> Void

    @State private var choosing = false

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
            mark
            if !choices.isEmpty { chooser }
        }
        .sheet(isPresented: $choosing) {
            ReceiptDraftChoiceSheet(
                title: label,
                choices: choices,
                selected: resolution.entityID,
                symbol: symbol,
                typed: text,
                onChoose: { choice in
                    onChoose(choice)
                    choosing = false
                }
            )
        }
    }

    /// A seal when a person settled it, a hollow one when the server merely
    /// proposed it, nothing when it is free text. Colour is not carrying this
    /// on its own: the two glyphs differ in shape as well, because a state
    /// told only by a hue is a state some readers do not have.
    @ViewBuilder private var mark: some View {
        switch resolution {
        case .chosen:
            Image(systemName: "checkmark.seal.fill")
                .font(.popsCaption)
                .foregroundStyle(Color.popsSuccess)
                .accessibilityLabel(ReceiptDraftCopy.resolvedByPerson)
        case .matched:
            Image(systemName: "checkmark.seal")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityLabel(ReceiptDraftCopy.resolvedByServer)
        case .typed:
            EmptyView()
        }
    }

    private var chooser: some View {
        Button {
            choosing = true
        } label: {
            Image(systemName: "list.bullet")
                .font(.popsBody)
                .foregroundStyle(Color.popsAccent)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ReceiptDraftCopy.chooseFromKnown)
    }

    private var symbol: String {
        label == ReceiptDraftCopy.addressLabel ? "mappin.and.ellipse" : "building.2"
    }
}

/// The list, searchable.
///
/// Hundreds of rows is the case this is built for, so search is the primary
/// control rather than a refinement — and the row that keeps what was typed
/// is always last and always present, because the thing a till printed is
/// frequently a merchant nobody has a record of, and a picker with no way out
/// is a picker that has to be dismissed to be escaped.
internal struct ReceiptDraftChoiceSheet: View {
    internal let title: String
    internal let choices: [String]
    internal let selected: String?
    internal let symbol: String
    internal let typed: String
    internal let onChoose: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var matches: [String] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return choices }
        return choices.filter { $0.localizedCaseInsensitiveContains(trimmed) }
    }

    internal var body: some View {
        NavigationStack {
            List {
                if matches.isEmpty {
                    Text(ReceiptDraftCopy.noMatches)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                } else {
                    ForEach(matches, id: \.self) { choice in
                        row(choice)
                    }
                }
                if !typed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Section {
                        Button {
                            dismiss()
                        } label: {
                            Label(
                                ReceiptDraftCopy.keepTyped(typed),
                                systemImage: "character.cursor.ibeam")
                        }
                    }
                }
            }
            .navigationTitle(title)
            .searchable(text: $query, prompt: ReceiptDraftCopy.searchChoices)
            .toolbar {
                ToolbarItem {
                    Button(ReceiptDraftCopy.cancelChoosing) { dismiss() }
                }
            }
        }
    }

    private func row(_ choice: String) -> some View {
        Button {
            onChoose(choice)
        } label: {
            HStack(spacing: PopsSpacing.md) {
                Label(choice, systemImage: symbol)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
                Spacer(minLength: PopsSpacing.sm)
                if choice == selected {
                    Image(systemName: "checkmark")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsAccent)
                }
            }
        }
    }
}
