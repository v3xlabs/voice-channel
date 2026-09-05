use tokio_xmpp::minidom::rxml::NcName;
use tokio_xmpp::minidom::{ElementBuilder, IntoAttributeValue};

/// `ElementBuilder::attr` takes a validated `NcName`. Every attribute name in this
/// crate is a literal, so the validation cannot fail.
pub trait AttrStr {
    fn attr_str(self, name: &'static str, value: impl IntoAttributeValue) -> Self;
}

impl AttrStr for ElementBuilder {
    fn attr_str(self, name: &'static str, value: impl IntoAttributeValue) -> Self {
        self.attr(
            NcName::try_from(name).expect("attribute name is a valid NCName"),
            value,
        )
    }
}
