import { Button, Html, Markdown, Section } from "@react-email/components";

/**
 * Sent when someone tries to create an account with an address that already
 * has one and is already verified.
 *
 * The sign-up response cannot say "that address is taken" without telling any
 * stranger which addresses have accounts here, so the answer goes to the one
 * party entitled to it: whoever reads that inbox. Usually that is the learner
 * themselves, having forgotten they registered, and this is their way back in.
 */
export function ExistingAccountEmail(props: {
  signInLink: string;
  resetLink: string;
  username: string;
}) {
  return (
    <Html>
      <Markdown>
        {`Hello ${props.username},

Someone just tried to create a Hanzimind account with this email address, and it already has one — so we didn't make a second.

If that was you, you're already signed up. Sign in below. If you can't remember your password, reset it instead and you'll be back to your decks in a minute.

If it wasn't you, there's nothing to do. Nobody has been given access to your account and nothing about it has changed.`}
      </Markdown>
      {/* One per Section, which renders a table row: two Buttons as siblings
          are inline anchors and came out as "Sign inReset your password". */}
      <Section>
        <Button href={props.signInLink}>Sign in</Button>
      </Section>
      <Section>
        <Button href={props.resetLink}>Reset your password</Button>
      </Section>
    </Html>
  );
}

export default async function Preview() {
  return (
    <ExistingAccountEmail
      signInLink="https://example.com/signin"
      resetLink="https://example.com/forgot-password"
      username="John Doe"
    />
  );
}
