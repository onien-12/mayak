import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, SendHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { requireAuth } from '@/features/auth';
import {
  errorMessage,
  placesApi,
  queryKeys,
  rereadAfterCheck,
  type PlaceDetail,
} from '@/shared/api';
import { formatRelative } from '@/shared/lib/format';
import {
  EmptyState,
  ErrorState,
  IconButton,
  OnReviewMark,
  Skeleton,
  Textarea,
  toast,
  UserChip,
} from '@/shared/ui';

const MAX_TEXT = 2000;

/** Discussion: questions and clarifications about the place, oldest first. */
export function CommentsTab({ place }: { place: PlaceDetail }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const key = queryKeys.places.comments(place.id);
  const comments = useQuery({ queryKey: key, queryFn: () => placesApi.comments(place.id) });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: queryKeys.places.detail(place.id) });
  };
  const add = useMutation({
    mutationFn: () => placesApi.addComment(place.id, text.trim()),
    onSuccess: () => {
      setText('');
      refresh();
      rereadAfterCheck([key, queryKeys.places.detail(place.id)]);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: placesApi.deleteComment,
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="flex flex-col gap-3">
      {comments.isPending && <Skeleton className="h-20 rounded-card" />}
      {comments.isError && (
        <ErrorState error={comments.error} onRetry={() => void comments.refetch()} />
      )}
      {comments.data?.length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          title="Обсуждения пока нет"
          description="Задайте вопрос или уточните детали — автор получит уведомление."
          className="py-6"
        />
      )}
      {comments.data && comments.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {comments.data.map((comment) => (
            <li key={comment.id} className="rounded-card bg-canvas p-3">
              <div className="flex items-center justify-between gap-2">
                <UserChip
                  user={comment.author}
                  size="sm"
                  caption={formatRelative(comment.created_at)}
                />
                {comment.can_delete && (
                  <IconButton
                    icon={Trash2}
                    label="Удалить комментарий"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(comment.id)}
                  />
                )}
              </div>
              <p className="mt-2 text-sm whitespace-pre-line text-ink">{comment.text}</p>
              {comment.on_review && <OnReviewMark className="mt-2" />}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) requireAuth(() => add.mutate(), 'чтобы написать комментарий');
        }}
        className="flex items-end gap-2"
      >
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_TEXT}
          rows={1}
          placeholder="Написать комментарий"
          aria-label="Комментарий"
          className="min-h-12 lg:min-h-11"
        />
        <IconButton
          type="submit"
          icon={SendHorizontal}
          label="Отправить"
          variant="solid"
          size="lg"
          className="size-12 lg:size-11"
          disabled={!text.trim() || add.isPending}
        />
      </form>
    </div>
  );
}
