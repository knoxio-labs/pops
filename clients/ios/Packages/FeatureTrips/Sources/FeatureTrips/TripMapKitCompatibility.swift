import MapKit

internal func tripMapItemAddress(_ item: MKMapItem) -> String? {
    #if os(macOS)
        item.placemark.title
    #else
        item.addressRepresentations?.fullAddress(includingRegion: false, singleLine: true)
    #endif
}

internal func tripMapItemCoordinate(_ item: MKMapItem) -> CLLocationCoordinate2D {
    #if os(macOS)
        item.placemark.coordinate
    #else
        item.location.coordinate
    #endif
}
