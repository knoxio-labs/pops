import SwiftUI

/// A value somebody can change, drawn as the value itself rather than as a box
/// around it.
///
/// Underlined rather than boxed, and that is a decision about what the screens
/// using it are for. A form over a reading of a receipt has to stay readable
/// *as the receipt* — merchant at the top, items in a column, total at the
/// foot — because the reader's job is running it against the paper in their
/// hand. Wrapping every value in a filled rounded rectangle turns that layout
/// into a settings screen, and the comparison the surface exists for gets
/// harder to make. A rule under the value keeps the reading's shape and still
/// says "this is yours to change".
///
/// The type ramp is the caller's, not this view's: a merchant name is set in
/// ``Font/popsTitle`` and a total in ``Font/popsAmount`` because they are
/// different weights of fact, and a field that imposed one size would flatten
/// the hierarchy the screen was built around.
///
/// Every state it can be in is drawn here rather than by each caller — focus,
/// a hint, a problem — for the reason ``PopsButton`` draws its own disabled
/// state: three screens inventing their own focus rule is three focus rules.
public struct PopsTextField: View {
    @FocusState private var isFocused: Bool

    /// The base touch target, scaled with the text. A field shorter than a
    /// fingertip is one that gets missed, and at the small Dynamic Type sizes
    /// a single line of text is well under it.
    @ScaledMetric(relativeTo: .body) private var minimumHeight = PopsSize.touchTarget

    private let label: String?
    private let placeholder: String
    private let font: Font
    private let alignment: TextAlignment
    private let keyboard: PopsFieldKeyboard
    private let note: PopsFieldNote?
    @Binding private var text: String

    /// - Parameters:
    ///   - label: what the value is, set above it. `nil` where the row it sits
    ///     in already says — a line item's description is not labelled
    ///     "Description".
    ///   - placeholder: what belongs here, shown when nothing does. This is
    ///     how a field the extractor read nothing for says so: an empty field
    ///     with a prompt, not a missing row.
    ///   - text: the value, live from the first frame.
    ///   - font: the ramp step this value sits at.
    ///   - alignment: `.trailing` for an amount, so a column of them lines up
    ///     where a receipt prints them.
    ///   - keyboard: which keys to offer. Ignored off iOS.
    ///   - note: a hint or a problem, drawn under the rule.
    public init(
        _ label: String? = nil,
        placeholder: String,
        text: Binding<String>,
        font: Font = .popsBody,
        alignment: TextAlignment = .leading,
        keyboard: PopsFieldKeyboard = .text,
        note: PopsFieldNote? = nil
    ) {
        self.label = label
        self.placeholder = placeholder
        _text = text
        self.font = font
        self.alignment = alignment
        self.keyboard = keyboard
        self.note = note
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            if let label {
                Text(label)
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            field
            Rectangle()
                .fill(ruleColor)
                .frame(height: ruleWidth)
                .frame(maxWidth: .infinity)
                .accessibilityHidden(true)
            if let note {
                Text(note.text)
                    .font(.popsCaption)
                    .foregroundStyle(note.tone.color)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
    }

    private var field: some View {
        TextField(
            label ?? placeholder,
            text: $text,
            prompt: Text(placeholder).foregroundStyle(Color.popsMutedForeground)
        )
        .labelsHidden()
        .textFieldStyle(.plain)
        .font(font)
        .multilineTextAlignment(alignment)
        .foregroundStyle(Color.popsForeground)
        .focused($isFocused)
        .frame(minHeight: minimumHeight)
        .popsKeyboard(keyboard)
    }

    /// The rule carries the state, because the value above it must not: a
    /// value tinted red is a value the reader misreads as being what is wrong,
    /// when what is wrong is that it is missing.
    private var ruleColor: Color {
        if isFocused { return .popsAccent }
        if note?.tone == .danger { return .popsDestructive }
        return .popsSeparator
    }

    private var ruleWidth: CGFloat {
        isFocused || note?.tone == .danger ? PopsBorder.emphasis : PopsBorder.hairline
    }

    /// The label and the note read as one utterance. A note announced as a
    /// separate element is a sentence the listener has to pair back up with
    /// the field it is about, and the whole point of a note is that it belongs
    /// to that field.
    private var accessibilityLabel: String {
        [label, note?.text].compactMap { $0 }.joined(separator: ", ")
    }
}

/// Something said about a field, beside the field.
///
/// Two cases rather than a free string and a colour, so "a hint is not a
/// failure" is a fact about the app instead of a choice each screen makes. It
/// matters on a correction surface more than anywhere else: the extractor
/// being unsure about a value is a reason to look at it, and drawing that in
/// the same colour as "this cannot be saved" turns a prompt into an
/// accusation.
public enum PopsFieldNote: Hashable, Sendable {
    /// The value may want attention. Nothing is blocked, and the reader may
    /// well decide it is already right.
    case hint(String)
    /// The value is not usable as it stands.
    case problem(String)

    public var text: String {
        switch self {
        case .hint(let text), .problem(let text): text
        }
    }

    /// Borrowed from ``PopsStatusHeader/Tone`` rather than named again here,
    /// so a hint on a field and a warning at the top of a screen are the same
    /// colour by construction.
    public var tone: PopsStatusHeader.Tone {
        switch self {
        case .hint: .warning
        case .problem: .danger
        }
    }
}

/// Which keys a field asks for.
///
/// Named by what is being typed rather than by the `UIKeyboardType` case, so
/// the one place that knows a receipt total is typed on a decimal pad is this
/// enum and not every caller.
public enum PopsFieldKeyboard: Hashable, Sendable {
    case text
    /// An amount: digits and a decimal separator.
    case decimal
    /// A count: digits only.
    case number
}

extension View {
    /// A no-op off iOS, where `keyboardType` does not exist. The packages that
    /// draw these fields also build for macOS so `swift test` runs on a
    /// developer machine without a simulator, and a `#if` at every call site
    /// is how that detail leaks into screens that should not know it.
    fileprivate func popsKeyboard(_ keyboard: PopsFieldKeyboard) -> some View {
        #if os(iOS)
            return
                self
                .keyboardType(keyboard.uiKeyboardType)
                .autocorrectionDisabled(keyboard != .text)
                .textInputAutocapitalization(keyboard == .text ? .sentences : .never)
        #else
            return self
        #endif
    }
}

#if os(iOS)
    import UIKit

    extension PopsFieldKeyboard {
        fileprivate var uiKeyboardType: UIKeyboardType {
            switch self {
            case .text: .default
            case .decimal: .decimalPad
            case .number: .numberPad
            }
        }
    }
#endif

#Preview("Text field") {
    @Previewable @State var merchant = "Kmart Broadway"
    @Previewable @State var total = "84.23"
    @Previewable @State var missing = ""

    return ColorSchemePreview {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            PopsTextField("Merchant", placeholder: "Who you bought from", text: $merchant)
            PopsTextField(
                "Total", placeholder: "0.00", text: $total, font: .popsAmount,
                alignment: .trailing, keyboard: .decimal)
            PopsTextField(
                "Address", placeholder: "Where the shop is", text: $missing,
                note: .hint("The left edge of this line is distorted."))
            PopsTextField(
                "Total", placeholder: "0.00", text: $missing, keyboard: .decimal,
                note: .problem("A total is needed before this can be saved."))
        }
        .padding(PopsSpacing.lg)
    }
}
