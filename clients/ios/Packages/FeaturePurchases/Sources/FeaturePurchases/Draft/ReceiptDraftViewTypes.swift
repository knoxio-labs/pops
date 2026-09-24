import AppCore
import DesignSystem

extension ReceiptDraftView {
    /// How much room the gate's complaint is given.
    ///
    /// Every style keeps per-field hints. The styles decide whether a
    /// complaint that names no field gets its own header above the form.
    public enum ComplaintStyle: Hashable, Sendable, CaseIterable {
        /// The full header above the fields.
        case banner
        /// No summary; fields retain their own hints.
        case hintsOnly
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
}
