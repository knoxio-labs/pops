import DesignSystem
import FeaturePurchases
import SwiftUI

/// One staged page, pinchable and pannable.
///
/// The viewer gives each page its own identity, so moving to the next photograph builds a new
/// zoomable photo at rest instead of carrying magnification to different bytes.
internal struct ZoomablePage: View {
    internal let page: StagedPage

    internal var body: some View {
        PopsZoomablePhoto(data: page.bytes, placeholderSymbol: page.symbolName)
            .accessibilityLabel(page.label)
    }
}
