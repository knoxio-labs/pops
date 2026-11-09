/// Repository recovery contract for a collection whose continuation tokens pin a source snapshot.
public enum TripsReadPolicy {
    /// One complete restart, matching the existing native cursor-read recovery policy.
    /// Restarting discards every partial page; it never limits the returned collection.
    public static let maximumSnapshotRestarts = 1

    /// Recoverable RepositoryError.conflict reason after the snapshot restart budget is exhausted.
    public static let sourceChangedReason = "trip_source_changed"
}
