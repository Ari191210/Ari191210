import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { navigate } from '../lib/router';
import { LazyPhotoTile } from '../components/Photos';
import { Empty } from './SupplierList';

export function PhotoGrid() {
  // Keys only: tiles load their own records lazily, so hundreds of photos stay cheap.
  const ids = useLiveQuery(() => db.photos.orderBy('created_at').reverse().primaryKeys(), []);
  if (!ids) return null;
  if (ids.length === 0) return <Empty title="No photos yet" body="Photos from suppliers and notes all show up here." />;
  return (
    <>
      <p className="mb-2 text-sm text-slate-500">{ids.length} photos · tap to open the entry</p>
      <div className="-mx-4 grid grid-cols-3 gap-0.5 sm:grid-cols-4">
        {ids.map((id) => (
          <LazyPhotoTile
            key={id}
            id={id}
            onOpen={(p) => navigate({ name: p.owner_type, id: p.owner_id, isNew: false })}
          />
        ))}
      </div>
    </>
  );
}
