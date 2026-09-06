import { Button, Html, Markdown } from "@react-email/components";

export function PasswordResetEmail(props: { link: string; username: string }) {
  return (
    <Html>
      <Markdown>
        {`Hello ${props.username},

Someone asked to reset your Hanzimind password. Click the button below to choose a new one. The link works once and expires in an hour.

If this wasn't you, ignore this email and your password stays as it is.`}
      </Markdown>
      <Button href={props.link}>Reset Password</Button>
    </Html>
  );
}

export default async function Preview() {
  return <PasswordResetEmail link="https://example.com" username="John Doe" />;
}
