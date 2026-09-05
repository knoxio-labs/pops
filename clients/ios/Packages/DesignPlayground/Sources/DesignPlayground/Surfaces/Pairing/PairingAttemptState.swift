import FeaturePairing
import SwiftUI

/// Drives a fresh pairing attempt as soon as it appears, so a review sees the
/// attempt's outcome — a specific failure, or an attempt stuck mid-flight —
/// rather than an untouched form.
///
/// The model lives in `@State` here, not rebuilt on every `body` evaluation:
/// `.task` runs once per view identity, and rebuilding the model underneath it
/// would start a second attempt against a `PairingView` still displaying the
/// first.
internal struct PairingAttemptState: View {
    @State private var model: PairingViewModel

    internal init(outcome: PlaygroundPairingService.Outcome) {
        _model = State(wrappedValue: PairingSurfaceFactory.readyModel(outcome: outcome))
    }

    internal var body: some View {
        PairingView(model: model)
            .task { await model.pair() }
    }
}
