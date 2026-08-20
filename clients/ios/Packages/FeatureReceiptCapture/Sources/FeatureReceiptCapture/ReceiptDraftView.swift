import AppCore
import DesignSystem
import SwiftUI

/// A capture, as a form that arrived already filled in.
///
/// The same frame the rest of this tab is built on: content that scrolls with
/// a bar of actions pinned under it by `.safeAreaInset(edge: .bottom)`, so the
/// thing the screen is *for* stays reachable at the text sizes where the
/// content is longest — which on a form is every one of them.
///
/// The pages sit above the fields, as they sit above every other state of this
/// flow. A reader correcting a reading is comparing it against the paper, and
/// the paper being on the same screen is the whole reason a correction can be
/// made standing in a shop rather than at a desk.
///
/// ## Where the save goes
///
/// Out through a closure. This screen knows a draft was accepted and nothing
/// about what happens next, which is what lets the same screen serve a
/// correction, a hand-entered purchase and an edit of a saved one — three
/// tickets, one form, per this package's README.
///
/// Nothing in the shipped app calls it yet, and that is a real gap rather than
/// an oversight: saving a corrected extraction is the handset writing something
/// other than a raw capture, which the mobile surface's current ADR forbids
/// outright. The capability-scope model that replaces that rule is a separate,
/// unlanded decision. Building the form against a seam is the shape that
/// survives it; building a confirm-before-save flow that squeezed inside the
/// current rule is the shape that would have to be thrown away.
internal struct ReceiptDraftView: View {
    @State private var draft: ReceiptDraft

    private let title: String
    private let subtitle: String
    private let status: Status?
    private let parts: [ReceiptPart]
    private let secondaryAction: SecondaryAction?
    private let save: (ReceiptDraft) -> Void

    /// - Parameters:
    ///   - draft: pre-filled, and live from the first frame. There is no
    ///     second state in which it becomes editable.
    ///   - title: the screen's own name, in ``Font/popsLargeTitle``.
    ///   - subtitle: what the reader is being asked to do, in a sentence.
    ///   - status: the outcome that produced this reading, when one did.
    ///     Absent for a hand-entered purchase — nothing has happened to
    ///     report.
    ///   - parts: the pages this was read off, drawn above the fields. Empty
    ///     when there is no receipt.
    ///   - secondaryAction: the other thing that can be done here, at the
    ///     standard weight beside the prominent Save.
    ///   - save: called with the draft as it stands.
    internal init(
        draft: ReceiptDraft,
        title: String,
        subtitle: String,
        status: Status? = nil,
        parts: [ReceiptPart] = [],
        secondaryAction: SecondaryAction? = nil,
        save: @escaping (ReceiptDraft) -> Void
    ) {
        _draft = State(wrappedValue: draft)
        self.title = title
        self.subtitle = subtitle
        self.status = status
        self.parts = parts
        self.secondaryAction = secondaryAction
        self.save = save
    }

    /// What happened to the receipt this form was read off, as the glyph and
    /// the colour the screen opens with.
    internal struct Status: Hashable, Sendable {
        internal let tone: PopsStatusHeader.Tone
        internal let heading: String
        internal let message: String
        internal let caption: String?

        internal init(
            tone: PopsStatusHeader.Tone, heading: String, message: String, caption: String? = nil
        ) {
            self.tone = tone
            self.heading = heading
            self.message = message
            self.caption = caption
        }
    }

    internal struct SecondaryAction {
        internal let title: String
        internal let action: () -> Void

        internal init(title: String, action: @escaping () -> Void) {
            self.title = title
            self.action = action
        }
    }

    internal var body: some View {
        ScrollView {
            content
                .padding(PopsSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) { actions }
        .accessibilityIdentifier(ReceiptDraftAccessibility.form)
    }

    /// `internal` rather than `private` so the layout can be exercised
    /// without going through `body`'s scroll — the same affordance
    /// ``ReceiptResultView/content`` exposes, for the same reason.
    @ViewBuilder internal var content: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if !parts.isEmpty { ReceiptPagesView(parts: parts) }
            if let status {
                PopsStatusHeader(
                    tone: status.tone, title: status.heading, message: status.message,
                    caption: status.caption)
            }
            heading
            ReceiptDraftForm(draft: $draft)
        }
    }

    /// The screen's own name and what it is asking for.
    ///
    /// Both, and at two different weights, because the sentence is doing real
    /// work here: a form that arrives pre-filled has to say that editing it is
    /// ordinary, or a reader assumes the values are locked and goes looking
    /// for an Edit button that does not exist.
    private var heading: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(title)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
            Text(subtitle)
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Save is the prominent one; whatever else can be done here sits beside
    /// it at the standard weight. Exactly the demotion this package's README
    /// describes for the moment the form replaces the read-only reading —
    /// "Photograph another" stops being what the screen is for.
    private var actions: some View {
        PopsActionBar {
            PopsButton(ReceiptDraftCopy.save, prominence: .prominent) { save(draft) }
                .disabled(!draft.isSaveable)
                .accessibilityIdentifier(ReceiptDraftAccessibility.saveButton)
            if let secondaryAction {
                PopsButton(secondaryAction.title, action: secondaryAction.action)
            }
        }
    }
}
