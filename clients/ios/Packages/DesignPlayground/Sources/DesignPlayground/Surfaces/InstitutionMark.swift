import AppCore
import DesignSystem
import SwiftUI

/// The account mark led by the institution rather than by the kind: initials
/// on the institution's own tint, and the kind demoted to the subtitle.
///
/// The answer `account-chip-identity` chose on the web (2026-09-03) — "the
/// logo where one exists, initials on the brand colour where it does not".
/// There are no logos in this app, so this is the initials half of it.
struct InstitutionMark: View {
    let account: Account
    var size: CGFloat = 34

    var body: some View {
        let tint = Self.tint(for: initialsSource)
        return Text(initials)
            .font(.system(size: size * 0.36, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(tint, in: .rect(cornerRadius: PopsRadius.control))
            .accessibilityHidden(true)
    }

    private var initialsSource: String {
        account.institutionName ?? account.contact ?? account.name
    }

    /// Up to two initials, from the first two words that have one. A single
    /// long word gives one letter rather than its first two, because "AN" for
    /// ANZ reads as a truncation and "A" reads as a mark.
    private var initials: String {
        let words = initialsSource.split(separator: " ").prefix(2)
        return words.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    /// A stable hue per institution, derived from the name so two accounts at
    /// the same bank always mark the same and no list has to be told which
    /// colour to use.
    private static func tint(for name: String) -> Color {
        let hue = Double(abs(name.hashValue) % 360) / 360
        return Color(hue: hue, saturation: 0.55, brightness: 0.62)
    }
}

/// A list row that leads with the institution mark, for the variant that uses
/// it. Everything else about the row is `AccountListRow`'s — the difference
/// between the two variants has to be the mark and nothing else, or the
/// comparison is about two changes at once.
struct InstitutionLedRow: View {
    let account: Account

    var body: some View {
        let reading = AccountPresentation.read(account)
        return HStack(spacing: PopsSpacing.md) {
            InstitutionMark(account: account)
            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(AccountPresentation.label(for: account.kind))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .lineLimit(1)
            }
            Spacer(minLength: PopsSpacing.sm)
            Text(reading.amount)
                .font(.popsHeadline)
                .monospacedDigit()
                .foregroundStyle(reading.tone.color)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.vertical, PopsSpacing.xs)
    }
}
