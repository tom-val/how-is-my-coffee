import { useLocalSearchParams } from 'expo-router';

import { RatingComposer } from '@/features/rating/rating-composer';

/** `/rating/<id>/edit` — the same composer, seeded from the rating and saving with PUT. */
export default function EditRatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RatingComposer ratingId={id} />;
}
