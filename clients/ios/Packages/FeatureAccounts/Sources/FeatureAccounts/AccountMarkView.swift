import AppCore
import DesignSystem
import SwiftUI

/// How large an ``AccountMarkView`` draws, mirroring the three sizes
/// `pillars/design/src/kit/ios-account-mark.tsx` names for a list row, a
/// picker row and an account's own header.
internal enum AccountMarkSize {
    case small
    case medium
    case large

    /// The base side length at the default text size. Scaled through
    /// `@ScaledMetric` at the call site rather than here, so the mark grows
    /// with Dynamic Type instead of clipping the initials or the glyph inside
    /// a frame that stayed fixed.
    internal var baseDimension: CGFloat {
        switch self {
        case .small: 24
        case .medium: 38
        case .large: 54
        }
    }

    internal var font: Font {
        switch self {
        case .small: .popsCaption
        case .medium: .popsSubheadline
        case .large: .popsHeadline
        }
    }
}

/// An account's identity mark: the institution's initials on a neutral
/// surface, or the kind's own glyph when there is no institution to name.
///
/// The design fixture's ladder also draws an institution's logo image and its
/// own brand colour. Neither travels over `AccountsRepository` today — the
/// domain model carries only ``Account/institutionName``, a plain string, and
/// nothing yet says what colour or image an institution owns — so this mark is
/// the two-step fallback rather than the three-step one, documented as a gap
/// rather than invented against data that is not there.
internal struct AccountMarkView: View {
    @ScaledMetric private var dimension: CGFloat

    private let account: Account
    private let size: AccountMarkSize

    internal init(account: Account, size: AccountMarkSize = .medium) {
        self.account = account
        self.size = size
        _dimension = ScaledMetric(wrappedValue: size.baseDimension, relativeTo: .body)
    }

    internal var body: some View {
        Group {
            if let institutionName = account.institutionName {
                Text(initials(institutionName))
                    .font(size.font.weight(.semibold))
                    .foregroundStyle(Color.popsBackground)
                    .frame(width: dimension, height: dimension)
                    .background(Color.popsAccent, in: RoundedRectangle(cornerRadius: dimension / 4))
            } else {
                Image(systemName: AccountKindLabel.symbolName(for: account.kind))
                    .font(size.font)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(width: dimension, height: dimension)
                    .background(
                        Color.popsSurface, in: RoundedRectangle(cornerRadius: dimension / 4)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: dimension / 4)
                            .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
                    )
            }
        }
        .accessibilityHidden(true)
        .opacity(account.archived ? 0.55 : 1)
    }

    /// Up to two letters, the same shape `institutions.ts`'s `initials` helper
    /// draws on the web: the first letter of up to the first two words.
    private func initials(_ name: String) -> String {
        let letters =
            name
            .split(separator: " ")
            .prefix(2)
            .compactMap { $0.first }
            .map(String.init)
        return letters.joined().uppercased()
    }
}
