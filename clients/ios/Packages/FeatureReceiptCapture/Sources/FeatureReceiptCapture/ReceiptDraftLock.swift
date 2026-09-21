import DesignSystem
import SwiftUI

/// Fields of a saved purchase the form shows but will not change, and the
/// one line saying why.
///
/// ``ReceiptDraft`` itself still has no notion of a locked field, and that is
/// deliberate: a reading being corrected is editable everywhere. A lock is a
/// fact about the purchase the draft was opened on, something outside the
/// form already depends on those values, so it is handed to the view by
/// whoever knows that and is never inferred here.
public struct ReceiptDraftLock: Hashable, Sendable {
    /// The fields a caller may lock. Only the ones something outside the
    /// purchase can depend on; the lines and adjustments describe it and are
    /// never locked.
    public enum Field: Hashable, Sendable, CaseIterable {
        case merchant
        case date
        case total
    }

    internal let fields: Set<Field>
    internal let reason: String

    /// - Parameters:
    ///   - fields: shown read-only, with a lock where the control would be.
    ///   - reason: one line above the form naming what holds them.
    public init(fields: Set<Field>, reason: String) {
        self.fields = fields
        self.reason = reason
    }

    internal func locks(_ field: Field) -> Bool { fields.contains(field) }
}

/// Where the form's Save lives.
public enum ReceiptDraftCommit: Hashable, Sendable {
    /// A bar pinned under the form, which is what the capture flow uses.
    case actionBar
    /// The navigation bar's confirmation slot, for a form presented in a sheet
    /// that the host titles and cancels. Save there stays disabled until the
    /// draft differs from the one the form opened on: a sheet whose Save
    /// writes nothing new is a Save that lies about what it does.
    case navigationBar
}

/// A locked value: the label, the value at the weight its field would have,
/// and a lock where the control would be.
internal struct ReceiptDraftLockedRow: View {
    internal let label: String
    internal let value: String
    internal var font: Font = .popsBody

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.sm) {
                Text(value)
                    .font(font)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(2)
                Spacer(minLength: PopsSpacing.sm)
                Image(systemName: "lock.fill")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .frame(minHeight: PopsSize.touchTarget)
            PopsDivider()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)")
        .accessibilityValue(ReceiptDraftCopy.lockedValue)
    }
}

/// The lock's reason, once, above the fields it holds.
internal struct ReceiptDraftLockNotice: View {
    internal let lock: ReceiptDraftLock

    internal var body: some View {
        Label {
            Text(lock.reason)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        } icon: {
            Image(systemName: "lock.fill")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
