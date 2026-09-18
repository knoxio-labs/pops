import Foundation

/// Bytes for one of the bundled sample photographs.
///
/// Real JPEGs rather than generated pixels, so a photo fixture exercises the
/// same decode path (`PopsPhoto`) the shipped app uses, and a screenshot
/// shows something a reviewer can judge instead of a solid placeholder. Read
/// from `Bundle.module`, so this is local resource loading, not the network
/// access `Catalog.swift` forbids this package from reaching.
internal enum SamplePhoto {
    internal static func data(_ name: String) -> Data? {
        // `.process` on a resource directory flattens its contents to the
        // bundle root rather than preserving `Resources/SamplePhotos/` as a
        // subdirectory, so no `subdirectory:` argument is passed here.
        guard let url = Bundle.module.url(forResource: name, withExtension: "jpg")
        else { return nil }
        return try? Data(contentsOf: url)
    }
}
