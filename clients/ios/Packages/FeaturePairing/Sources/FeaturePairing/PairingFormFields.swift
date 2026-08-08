import DesignSystem
import SwiftUI

/// The three values `POST /devices/pair` needs, as one editable block.
///
/// Always present, whether or not a QR was scanned. A scan fills these fields
/// rather than replacing them with a confirmation screen, so "the camera did
/// not work" and "there is no camera" both resolve to the same place the person
/// was already looking — and so the name can be corrected before it is sent.
internal struct PairingFormFields: View {
    @Bindable internal var model: PairingViewModel

    internal var body: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                PairingTextField(
                    label: PairingCopy.serverLabel,
                    placeholder: PairingCopy.serverPlaceholder,
                    text: $model.baseURLText
                )
                .popsURLFieldStyle()

                PairingTextField(
                    label: PairingCopy.codeLabel,
                    placeholder: PairingCopy.codePlaceholder,
                    text: $model.codeText
                )
                .popsPairingCodeFieldStyle()

                PairingTextField(
                    label: PairingCopy.nameLabel,
                    placeholder: PairingCopy.namePlaceholder,
                    text: $model.deviceNameText
                )
            }
        }
    }
}

/// A labelled line of text entry.
///
/// The label is a real `Text` above the field rather than the field's own
/// placeholder, because a placeholder disappears the moment there is content —
/// which is exactly when someone reviewing a scanned value needs to know which
/// field they are looking at. `accessibilityLabel` ties the two together so
/// VoiceOver reads "Pairing code, text field" rather than the value alone.
internal struct PairingTextField: View {
    internal let label: String
    internal let placeholder: String
    @Binding internal var text: String

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            TextField(placeholder, text: $text)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
                .accessibilityLabel(label)
            Rectangle()
                .fill(Color.popsSeparator)
                .frame(height: PopsBorder.hairline)
        }
    }
}

extension View {
    /// URL-shaped entry. The keyboard type and capitalisation modifiers exist
    /// only on iOS; on the host toolchain — where this package is compiled so
    /// its logic can be tested without booting a simulator — the rest still
    /// applies. See the package README on why the host build is kept working.
    internal func popsURLFieldStyle() -> some View {
        #if os(iOS)
            return
                self
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        #else
            return self.autocorrectionDisabled()
        #endif
    }

    /// Pairing codes are upper-case and hyphenated. Autocorrect on a field of
    /// random characters does not help and does substitute.
    internal func popsPairingCodeFieldStyle() -> some View {
        #if os(iOS)
            return
                self
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
        #else
            return self.autocorrectionDisabled()
        #endif
    }
}
