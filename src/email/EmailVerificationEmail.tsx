import { Button, Html, Markdown } from "@react-email/components";

export function EmailVerificationEmail(props: {
  link: string;
  username: string;
}) {
  return (
    <Html>
      <Markdown>
        {`Hello ${props.username},

Welcome to Hanzimind! Please verify your email address by clicking the button below.`}
      </Markdown>
      <Button href={props.link}>Verify Email</Button>
    </Html>
  );
}

export default async function Preview() {
  return (
    <EmailVerificationEmail link="https://example.com" username="John Doe" />
  );
}
