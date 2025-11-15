drop policy "Users can insert chats for their documents" on "public"."document_chats";


  create policy "Users can insert their own messages"
  on "public"."document_chats"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



