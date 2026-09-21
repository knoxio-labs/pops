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
public struct ReceiptDraftView: View {
    @State private var ownDraft: ReceiptDraft
    private let hostDraft: Binding<ReceiptDraft>?

    private let opened: ReceiptDraft
    private let title: String?
    private let subtitle: String?
    private let status: Status?
    private let parts: [ReceiptPart]
    private let complaints: ComplaintStyle
    private let merchants: [ReceiptMerchantChoice]
    private let secondaryAction: SecondaryAction?
    private let addAnother: AddAnother?
    private let lock: ReceiptDraftLock?
    private let commit: ReceiptDraftCommit
    private let onChange: ((ReceiptDraft) -> Void)?
    private let isSaving: Bool
    private let save: ((ReceiptDraft) -> Void)?

    private init(
        owned draft: ReceiptDraft,
        host: Binding<ReceiptDraft>?,
        title: String?,
        subtitle: String?,
        status: Status?,
        complaints: ComplaintStyle,
        merchants: [ReceiptMerchantChoice],
        parts: [ReceiptPart],
        secondaryAction: SecondaryAction?,
        addAnother: AddAnother?,
        lock: ReceiptDraftLock?,
        commit: ReceiptDraftCommit,
        onChange: ((ReceiptDraft) -> Void)?,
        isSaving: Bool,
        save: ((ReceiptDraft) -> Void)?
    ) {
        _ownDraft = State(wrappedValue: draft)
        hostDraft = host
        opened = draft
        self.title = title
        self.subtitle = subtitle
        self.status = status
        self.complaints = complaints
        self.merchants = merchants
        self.parts = parts
        self.secondaryAction = secondaryAction
        self.addAnother = addAnother
        self.lock = lock
        self.commit = commit
        self.onChange = onChange
        self.isSaving = isSaving
        self.save = save
    }

    /// How much room the gate's complaint is given.
    ///
    /// It is a full status header today, which is right when the reading is
    /// the whole screen — the result screen opens on it and the tone is the
    /// first thing read. Inside the review step the same block costs the top
    /// of a screen whose entire job is the form below it, and none of it can
    /// be acted on.
    ///
    /// Every style keeps the per-field hints, which are where a complaint
    /// that names a field actually belongs. What the styles differ on is what
    /// happens to the complaints that name no field, and how loudly.
    public enum ComplaintStyle: Hashable, Sendable, CaseIterable {
        /// The full header, above the fields. What the result screen uses.
        case banner
        /// The same words at caption weight in one row.
        case compact
        /// A single line saying how many, opening on a tap.
        case collapsed
        /// Nothing at the top at all. The fields carry their own hints and
        /// anything naming no field is not shown here.
        case hintsOnly
        /// The full header, after the fields, so the screen opens on
        /// something that can be acted on.
        case belowForm
    }

    /// What happened to the receipt this form was read off, as the glyph and
    /// the colour the screen opens with.
    public struct Status: Hashable, Sendable {
        internal let tone: PopsStatusHeader.Tone
        internal let heading: String
        internal let message: String
        internal let caption: String?

        public init(
            tone: PopsStatusHeader.Tone, heading: String, message: String, caption: String? = nil
        ) {
            self.tone = tone
            self.heading = heading
            self.message = message
            self.caption = caption
        }
    }

    /// Saves, and keeps the form open for another purchase.
    ///
    /// Not a ``SecondaryAction``: that one takes no draft and is not held by
    /// the save rule, and this one is a save.
    public struct AddAnother {
        internal let action: (ReceiptDraft) -> Void

        public init(action: @escaping (ReceiptDraft) -> Void) {
            self.action = action
        }
    }

    public struct SecondaryAction {
        internal let title: String
        internal let action: () -> Void

        public init(title: String, action: @escaping () -> Void) {
            self.title = title
            self.action = action
        }
    }

    private var draft: ReceiptDraft { hostDraft?.wrappedValue ?? ownDraft }

    /// Whichever draft this form edits: the host's when it was given one.
    internal var editing: Binding<ReceiptDraft> { hostDraft ?? $ownDraft }

    public var body: some View {
        ScrollView {
            content
                .padding(PopsSpacing.lg)
        }
        // On the scroll view, before the action bar is inset: attached after
        // it, the identifier covered the bar too and replaced the Save
        // button's own, so nothing outside the process could find Save.
        .accessibilityIdentifier(ReceiptDraftAccessibility.form)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.popsBackground)
        .safeAreaInset(edge: .bottom) { if save != nil && commit == .actionBar { actions } }
        .toolbar {
            if save != nil && commit == .navigationBar {
                ToolbarItem(placement: .confirmationAction) { navigationSave }
            }
        }
        .onChange(of: draft) { _, next in onChange?(next) }
        // A tap outside a field puts the keyboard away, which it did not do
        // before: a form this long is mostly scrolling, and a keyboard that
        // only closes on Return is a keyboard covering half the receipt.
        .scrollDismissesKeyboard(.interactively)
    }

    /// `internal` rather than `private` so the layout can be exercised
    /// without going through `body`'s scroll — the same affordance
    /// ``ReceiptResultView/content`` exposes, for the same reason.
    @ViewBuilder internal var content: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if !parts.isEmpty { ReceiptPagesView(parts: parts) }
            if complaints != .belowForm { complaint }
            if title != nil || subtitle != nil { heading }
            if let lock { ReceiptDraftLockNotice(lock: lock) }
            ReceiptDraftForm(draft: editing, merchants: merchants, lock: lock)
            if complaints == .belowForm { complaint }
        }
    }

    @ViewBuilder private var complaint: some View {
        if let status {
            switch complaints {
            case .banner, .belowForm:
                PopsStatusHeader(
                    tone: status.tone, title: status.heading, message: status.message,
                    caption: status.caption)
            case .compact:
                compactComplaint(status)
            case .collapsed:
                CollapsedComplaint(status: status)
            case .hintsOnly:
                EmptyView()
            }
        }
    }

    private func compactComplaint(_ status: Status) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.popsCaption)
                .foregroundStyle(status.tone.color)
            Text(status.message)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: PopsSpacing.zero)
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            status.tone.color.opacity(0.12), in: .rect(cornerRadius: PopsRadius.control))
    }

    /// The screen's own name and what it is asking for.
    ///
    /// Both, and at two different weights, because the sentence is doing real
    /// work here: a form that arrives pre-filled has to say that editing it is
    /// ordinary, or a reader assumes the values are locked and goes looking
    /// for an Edit button that does not exist.
    private var heading: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            if let title {
                Text(title)
                    .font(.popsLargeTitle)
                    .foregroundStyle(Color.popsForeground)
            }
            if let subtitle {
                Text(subtitle)
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Whether either save can be pressed. Held while one is in flight, which
    /// is half of what stops a double tap creating two purchases. Public so a
    /// host committing from its own navigation bar gates on the same rule.
    public static func canSave(_ draft: ReceiptDraft, isSaving: Bool) -> Bool {
        draft.isSaveable && !isSaving
    }

    /// The same rule, plus the navigation bar's: there has to be something
    /// new to write.
    internal static func canSave(
        _ draft: ReceiptDraft, isSaving: Bool, changedFrom opened: ReceiptDraft
    ) -> Bool {
        canSave(draft, isSaving: isSaving) && draft != opened
    }

    private var navigationSave: some View {
        Button(isSaving ? ReceiptDraftCopy.saving : ReceiptDraftCopy.saveInBar) { save?(draft) }
            .disabled(!Self.canSave(draft, isSaving: isSaving, changedFrom: opened))
            .accessibilityIdentifier(ReceiptDraftAccessibility.saveButton)
            .receiptDraftProminentBarButton()
    }

    /// Save is the prominent one; whatever else can be done here sits beside
    /// it at the standard weight. Exactly the demotion this package's README
    /// describes for the moment the form replaces the read-only reading —
    /// "Photograph another" stops being what the screen is for.
    private var actions: some View {
        PopsActionBar {
            PopsButton(
                isSaving ? ReceiptDraftCopy.saving : ReceiptDraftCopy.save, prominence: .prominent
            ) { save?(draft) }
            .disabled(!Self.canSave(draft, isSaving: isSaving))
            .accessibilityIdentifier(ReceiptDraftAccessibility.saveButton)
            if let addAnother {
                PopsButton(ReceiptDraftCopy.saveAndAddAnother) { addAnother.action(draft) }
                    .disabled(!Self.canSave(draft, isSaving: isSaving))
                    .accessibilityIdentifier(ReceiptDraftAccessibility.saveAndAddAnotherButton)
            }
            if let secondaryAction {
                PopsButton(secondaryAction.title, action: secondaryAction.action)
            }
        }
    }
}

extension ReceiptDraftView {
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
    /// - Parameters:
    ///   - title: the screen's own name, and `nil` when it has none. A form
    ///     embedded in a flow that already says where you are — the review
    ///     step's `2 of 3` — would otherwise carry a second heading under the
    ///     first, saying less.
    ///   - save: `nil` omits the action bar entirely, for the same reason: a
    ///     form inside a batch is not the thing that saves, and two Save
    ///     buttons on one screen is one of them lying about what it does.
    ///   - addAnother: a second save beside Save that keeps the form open for
    ///     the next purchase, under the same rule Save is.
    ///   - isSaving: a save is in flight. Both saves hold, so a second tap
    ///     cannot create a second purchase.
    ///   - lock: fields of a saved purchase shown read-only, and why. `nil`
    ///     leaves every field editable, as a reading always is.
    ///   - commit: where Save is drawn. See ``ReceiptDraftCommit``.
    ///   - onChange: called with the draft after every edit, so a host that
    ///     owns the cancel can tell whether leaving loses anything.
    public init(
        draft: ReceiptDraft,
        title: String? = nil,
        subtitle: String? = nil,
        status: Status? = nil,
        complaints: ComplaintStyle = .banner,
        merchants: [ReceiptMerchantChoice] = [],
        parts: [ReceiptPart] = [],
        secondaryAction: SecondaryAction? = nil,
        addAnother: AddAnother? = nil,
        lock: ReceiptDraftLock? = nil,
        commit: ReceiptDraftCommit = .actionBar,
        onChange: ((ReceiptDraft) -> Void)? = nil,
        isSaving: Bool = false,
        save: ((ReceiptDraft) -> Void)? = nil
    ) {
        self.init(
            owned: draft, host: nil, title: title, subtitle: subtitle, status: status,
            complaints: complaints, merchants: merchants, parts: parts,
            secondaryAction: secondaryAction, addAnother: addAnother, lock: lock,
            commit: commit, onChange: onChange, isSaving: isSaving, save: save)
    }

    /// The same form over a draft the host owns, for a host that commits from
    /// its own navigation bar and so has to read the draft's validity as it
    /// changes, or that pages between several drafts and must keep each one's
    /// edits when it is off screen. Every other parameter is the owned form's.
    public init(
        draft: Binding<ReceiptDraft>,
        title: String? = nil,
        subtitle: String? = nil,
        status: Status? = nil,
        complaints: ComplaintStyle = .banner,
        merchants: [ReceiptMerchantChoice] = [],
        parts: [ReceiptPart] = [],
        secondaryAction: SecondaryAction? = nil,
        addAnother: AddAnother? = nil,
        isSaving: Bool = false,
        save: ((ReceiptDraft) -> Void)? = nil
    ) {
        self.init(
            owned: draft.wrappedValue, host: draft, title: title, subtitle: subtitle,
            status: status, complaints: complaints, merchants: merchants, parts: parts,
            secondaryAction: secondaryAction, addAnother: addAnother, lock: nil,
            commit: .actionBar, onChange: nil, isSaving: isSaving, save: save)
    }
}

extension View {
    /// The commit in a sheet's bar, drawn as the platform's prominent glass so
    /// it reads as the sheet's one call to action. The glass style is
    /// iOS-only; the host toolchain that runs this package's tests stands in
    /// with the bordered prominent one.
    @ViewBuilder
    fileprivate func receiptDraftProminentBarButton() -> some View {
        #if os(iOS)
            buttonStyle(.glassProminent)
        #else
            buttonStyle(.borderedProminent)
        #endif
    }
}
