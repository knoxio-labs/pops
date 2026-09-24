import AppCore
import DesignSystem

extension ReceiptDraftView {
    /// How much room the gate's complaint is given.
    ///
    /// Every style keeps per-field hints. The styles decide how complaints that name no field are
    /// presented around the form.
    public enum ComplaintStyle: Hashable, Sendable, CaseIterable {
        /// The full header above the fields.
        case banner
        /// The same words at caption weight in one row.
        case compact
        /// A single line saying how many, opening on a tap.
        case collapsed
        /// No summary; fields retain their own hints.
        case hintsOnly
        /// The full header after the fields.
        case belowForm
    }

    /// What happened to the receipt this form was read from.
    public struct Status: Hashable, Sendable {
        internal let tone: PopsStatusHeader.Tone
        internal let heading: String
        internal let message: String
        internal let caption: String?

        /// Creates a status header value for the draft form.
        public init(
            tone: PopsStatusHeader.Tone,
            heading: String,
            message: String,
            caption: String? = nil
        ) {
            self.tone = tone
            self.heading = heading
            self.message = message
            self.caption = caption
        }
    }

    /// Saves and keeps the form open for another purchase.
    public struct AddAnother {
        internal let action: (ReceiptDraft) -> Void

        /// Creates the secondary save action.
        public init(action: @escaping (ReceiptDraft) -> Void) {
            self.action = action
        }
    }

    /// A non-save action displayed beside the form's primary action.
    public struct SecondaryAction {
        internal let title: String
        internal let action: () -> Void

        /// Creates a titled secondary action.
        public init(title: String, action: @escaping () -> Void) {
            self.title = title
            self.action = action
        }
    }
}
