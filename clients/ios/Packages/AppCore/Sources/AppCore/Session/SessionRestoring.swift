/// What the app was in the middle of, read back at launch.
///
/// The root switches on ``SessionState`` and has no way to produce one for a
/// process that has just started: the device's identity and its credentials
/// live behind `Auth`, which the root is the only thing allowed to know about.
/// This is that read, as a seam, so the launch path is assertable without a
/// keychain.
///
/// `async` because the answer comes off storage. It must resolve quickly and
/// unconditionally — the root shows nothing until it does, and a launch that
/// waits on a network call is a launch that hangs when the network does.
public protocol SessionRestoring: Sendable {
    /// The session this device left behind, or ``SessionState/unpaired`` when
    /// there is nothing usable to resume.
    ///
    /// Never throws. Every way this can fail — no credentials, a payload that
    /// no longer decodes, storage that cannot be read — means the same thing to
    /// the caller, which is that the app opens at pairing.
    func restoredSession() async -> SessionState
}
