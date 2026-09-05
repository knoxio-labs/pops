import AppCore
import DesignSystem
import SwiftUI

/// The coloured glyph that identifies an account before its name is read.
///
/// It carries the kind, not the institution, because at this size a bank's
/// logo is a coloured smudge and the kind is the thing that changes how the
/// number should be read.
internal struct AccountMark: View {
    let account: Account
    var size: CGFloat = 34

    var body: some View {
        let colour = AccountPresentation.markColor(for: account.kind)
        return Image(systemName: AccountPresentation.symbol(for: account.kind))
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(colour)
            .frame(width: size, height: size)
            .background(colour.opacity(0.14), in: .rect(cornerRadius: PopsRadius.control))
            .accessibilityHidden(true)
    }
}
