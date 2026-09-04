import { Button, Html, Markdown } from "@react-email/components";

export function ChangeEmailEmail(props: {
  link: string;
  username: string;
  newEmail: string;
}) {
  return (
    <Html>
      <Markdown>
        {`Hello ${props.username},

You asked to change your Hanzimind address to ${props.newEmail}. Click the button below to confirm it. Until you do, your account keeps the address this email was sent to.

If this wasn't you, ignore this email and nothing changes.`}
      </Markdown>
      <Button href={props.link}>Confirm New Email</Button>
    </Html>
  );
}

export default async function Preview() {
  return (
    <ChangeEmailEmail
      link="https://example.com"
      username="John Doe"
      newEmail="john.new@example.com"
    />
  );
}
