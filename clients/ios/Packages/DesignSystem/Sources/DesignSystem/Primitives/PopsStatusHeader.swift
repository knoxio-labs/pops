import SwiftUI

/// How a screen opens when it has an answer to report: a glyph, a heading, and
/// a sentence saying what happened.
///
/// The glyph is the point. Two outcomes that differ only in their wording are
/// two screens a reader has to *read* to tell apart, and a reader who has just
/// pressed a button is scanning rather than reading — so the tone carries the
/// difference in colour and in shape before any word is parsed, and the words
/// then say which one it was.
///
/// The tone chooses the symbol rather than the caller. A vocabulary of status
/// glyphs is exactly the kind of thing that drifts into three near-synonyms
/// across three screens, and holding it here is what makes "success looks like
/// this" a fact about the app rather than about whoever wrote the screen.
public struct PopsStatusHeader: View {
    /// What kind of answer this is.
    public enum Tone: Hashable, Sendable, CaseIterable {
        /// It worked.
        case success
        /// It did not fail, but it is not finished either — something needs a
        /// person.
        case warning
        /// It failed.
        case danger
        /// Neither: a fact about the situation the reader did not cause and
        /// cannot have got wrong.
        case information

        /// The token this tone draws in.
        public var color: Color {
            switch self {
            case .success: .popsSuccess
            case .warning: .popsWarning
            case .danger: .popsDestructive
            case .information: .popsAccent
            }
        }

        /// The SF Symbol this tone draws. Filled rather than outlined: at the
        /// small text sizes an outlined glyph in a status colour is a shape
        /// with almost no coloured area, which is the one thing the glyph is
        /// here to supply.
        public var symbolName: String {
            switch self {
            case .success: "checkmark.circle.fill"
            case .warning: "exclamationmark.triangle.fill"
            case .danger: "xmark.octagon.fill"
            case .information: "info.circle.fill"
            }
        }
    }

    private let tone: Tone
    private let title: String
    private let message: String
    private let caption: String?

    /// - Parameters:
    ///   - tone: what kind of answer this is, which picks the colour and the
    ///     glyph.
    ///   - title: the answer in three or four words.
    ///   - message: what it means and what to do about it.
    ///   - caption: supporting detail nobody has to read — how many photos
    ///     this came from, when it happened.
    public init(tone: Tone, title: String, message: String, caption: String? = nil) {
        self.tone = tone
        self.title = title
        self.message = message
        self.caption = caption
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Image(systemName: tone.symbolName)
                .font(.popsTitle)
                .foregroundStyle(tone.color)
                // The glyph restates the heading beneath it. Announced, it is
                // a wordless element between the reader and the sentence they
                // came for.
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text(title)
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsForeground)
                Text(message)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
                if let caption {
                    Text(caption)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
        // Stacked rather than set beside the heading, because at the
        // accessibility text sizes a glyph and a wrapping sentence side by
        // side leave the sentence a column two words wide.
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview("Status header") {
    ColorSchemePreview {
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            PopsStatusHeader(
                tone: .success, title: "Receipt saved", message: "The purchase has been recorded.")
            PopsStatusHeader(
                tone: .warning, title: "Needs a closer look",
                message: "Nothing was recorded.", caption: "From 2 photos.")
            PopsStatusHeader(
                tone: .danger, title: "Couldn't read this receipt", message: "Retake the photo.")
            PopsStatusHeader(
                tone: .information, title: "No camera",
                message: "This device has no camera.")
        }
        .padding(PopsSpacing.lg)
    }
}
