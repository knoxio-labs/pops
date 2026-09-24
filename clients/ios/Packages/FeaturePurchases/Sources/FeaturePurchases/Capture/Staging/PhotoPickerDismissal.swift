/// Decides whether a photo picker's dismissal was a cancel, whatever order the picker publishes its
/// selection and its dismissal in.
internal struct PhotoPickerDismissal {
    private var picked = false

    internal mutating func selectionArrived() {
        picked = true
    }

    /// Settles one dismissal: `true` when nothing was picked since the last one.
    internal mutating func settle() -> Bool {
        defer { picked = false }
        return !picked
    }
}
