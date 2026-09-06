import { Button, Html, Markdown } from "@react-email/components";

export function DeleteAccountEmail(props: { link: string; username: string }) {
  return (
    <Html>
      <Markdown>
        {`Hello ${props.username},

You asked to delete your Hanzimind account. Click the button below to confirm. This removes your account, your decks and everything you have grown, and it cannot be undone.

If this wasn't you, ignore this email and your account stays as it is.`}
      </Markdown>
      <Button href={props.link}>Delete My Account</Button>
    </Html>
  );
}

export default async function Preview() {
  return <DeleteAccountEmail link="https://example.com" username="John Doe" />;
}
