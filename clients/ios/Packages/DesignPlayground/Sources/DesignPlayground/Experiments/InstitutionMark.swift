import AppCore
import DesignSystem
import SwiftUI

/// The account mark led by the institution rather than by the kind: initials
/// on a tint drawn from the existing semantic palette, and the kind demoted to
/// the subtitle — the "institution-led" variant.
internal struct InstitutionMark: View {
    internal let account: Account
    internal var size: CGFloat = 34

    internal var body: some View {
        let tint = Self.tint(for: initialsSource)
        return Text(initials)
            .font(.popsSubheadline.weight(.semibold))
            .foregroundStyle(Color.popsBackground)
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

    /// A stable pick per institution, from the existing semantic palette
    /// rather than a computed hue — the real design (`account-chip-identity`,
    /// decided on the web 2026-09-03) draws a brand colour this app has
    /// nowhere to read from, and a token catalogue with one entry per
    /// institution is not a catalogue. Stable because it is derived from the
    /// name: two accounts at the same bank still mark the same.
    private static func tint(for name: String) -> Color {
        let palette: [Color] = [.popsAccent, .popsWarning, .popsSuccess, .popsDestructive]
        return palette[abs(name.hashValue) % palette.count]
    }
}

/// A list row that leads with the institution mark — the "institution-led"
/// variant's row. Everything else about it is ``AccountListRow``'s: the
/// difference between the two has to be the mark and nothing else, or the
/// comparison is about two changes at once.
internal struct InstitutionLedRow: View {
    internal let account: Account

    internal var body: some View {
        let reading = AccountExperimentPresentation.read(account)
        return HStack(spacing: PopsSpacing.md) {
            InstitutionMark(account: account)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(account.name)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(1)
                Text(AccountExperimentPresentation.label(for: account.kind))
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
